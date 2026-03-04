from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.models.physical_test import PhysicalTest, StudentPhysicalTestResult
from app.models.student import Student
from app.schemas.physical_test import (
    PhysicalTest as PhysicalTestSchema,
    PhysicalTestCreate,
    PhysicalTestUpdate,
    PhysicalTestResult as ResultSchema,
    PhysicalTestResultCreate,
    StudentPhysicalStats
)

router = APIRouter()

# ==================== TESTS DEFINITIONS ====================

@router.get("/", response_model=List[PhysicalTestSchema])
def get_physical_tests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all available physical tests"""
    return db.query(PhysicalTest).filter(PhysicalTest.is_active == True).all()

@router.post("/", response_model=PhysicalTestSchema)
def create_physical_test(
    test_data: PhysicalTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new physical test (Admin/Coach)"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    new_test = PhysicalTest(**test_data.dict())
    db.add(new_test)
    db.commit()
    db.refresh(new_test)
    return new_test

@router.put("/{test_id}", response_model=PhysicalTestSchema)
def update_physical_test(
    test_id: int,
    test_data: PhysicalTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a physical test"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    test = db.query(PhysicalTest).filter(PhysicalTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
        
    for key, value in test_data.dict(exclude_unset=True).items():
        setattr(test, key, value)
        
    db.commit()
    db.refresh(test)
    return test

@router.delete("/{test_id}")
def delete_physical_test(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Soft delete a physical test"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    test = db.query(PhysicalTest).filter(PhysicalTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
        
    test.is_active = False
    db.commit()
    return {"message": "Test deleted"}

# ==================== STUDENT RESULTS ====================

@router.get("/student/{student_id}", response_model=List[ResultSchema])
def get_student_results(
    student_id: int,
    quarter: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get physical test results for a student"""
    query = db.query(StudentPhysicalTestResult).filter(StudentPhysicalTestResult.student_id == student_id)
    
    if quarter:
        query = query.filter(StudentPhysicalTestResult.quarter == quarter)
    if year:
        query = query.filter(StudentPhysicalTestResult.year == year)
        
    return query.order_by(StudentPhysicalTestResult.year.desc(), StudentPhysicalTestResult.quarter.desc()).all()

@router.post("/student/{student_id}", response_model=ResultSchema)
def add_student_result(
    student_id: int,
    result_data: PhysicalTestResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add or update a result for a student"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if result already exists for this test/quarter/year
    existing = db.query(StudentPhysicalTestResult).filter(
        StudentPhysicalTestResult.student_id == student_id,
        StudentPhysicalTestResult.test_id == result_data.test_id,
        StudentPhysicalTestResult.quarter == result_data.quarter,
        StudentPhysicalTestResult.year == result_data.year
    ).first()
    
    if existing:
        existing.value = result_data.value
        existing.date = result_data.date or datetime.utcnow()
        existing.coach_id = current_user.id
        db.commit()
        db.refresh(existing)
        
        # Sync with student profile if this is height or weight
        _sync_student_profile(db, student_id, result_data.test_id, result_data.value)
        
        return existing
    
    # Prepare data, overriding student_id from path
    data = result_data.dict()
    data['student_id'] = student_id
    
    new_result = StudentPhysicalTestResult(
        **data,
        coach_id=current_user.id
    )
    db.add(new_result)
    db.commit()
    db.refresh(new_result)
    
    # Sync with student profile if this is height or weight
    _sync_student_profile(db, student_id, result_data.test_id, result_data.value)
    
    return new_result

def _sync_student_profile(db: Session, student_id: int, test_id: int, value: float):
    """
    Update student height/weight if the test corresponds to these metrics.
    """
    test = db.query(PhysicalTest).filter(PhysicalTest.id == test_id).first()
    if not test:
        return
        
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return
        
    # Check by category and name (or unit) to be safe
    # We normalized names to Russian: "Рост" and "Вес"
    name_lower = test.name.lower().strip()
    
    # Strict matching to avoid "Скорость" matching "рост"
    is_height = name_lower in ["рост", "height", "height (cm)", "рост (см)"]
    is_weight = name_lower in ["вес", "weight", "weight (kg)", "вес (кг)"]
    
    if is_height:
        student.height = value
        db.commit()
    elif is_weight:
        student.weight = value
        db.commit()

@router.delete("/result/{result_id}")
def delete_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a specific result"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COACH]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    result = db.query(StudentPhysicalTestResult).filter(StudentPhysicalTestResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
        
    db.delete(result)
    db.commit()
    return {"message": "Result deleted"}

# ==================== INITIALIZATION ====================

@router.post("/init-defaults")
def init_default_tests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Initialize default physical tests if they don't exist"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    defaults = [
        # Speed (Скорость)
        {"name": "Бег 30м", "unit": "сек", "category": "speed", "description": "Бег 30м с места"},
        {"name": "Бег 10м", "unit": "сек", "category": "speed", "description": "Бег 10м (стартовая скорость)"},
        
        # Tactics (Тактика) - used to be Agility but mapping to requested categories
        {"name": "Челночный бег 5-10-5", "unit": "сек", "category": "tactics", "description": "Челночный бег 5-10-5"},
        {"name": "Тест Иллинойс", "unit": "сек", "category": "tactics", "description": "Тест Иллинойс"},
        
        # Physical (Физика) - encompasses Power, Strength, Endurance
        {"name": "Прыжок в высоту", "unit": "см", "category": "physical", "description": "Прыжок в высоту с места"},
        {"name": "Прыжок в длину", "unit": "см", "category": "physical", "description": "Прыжок в длину с места"},
        {"name": "Отжимания (1 мин)", "unit": "раз", "category": "physical", "description": "Отжимания за 1 мин"},
        {"name": "Планка", "unit": "сек", "category": "physical", "description": "Планка (секунды)"},
        {"name": "Йо-Йо тест", "unit": "ур.", "category": "physical", "description": "Йо-Йо тест"},
        {"name": "Тест Купера", "unit": "м", "category": "physical", "description": "Тест Купера (12 мин)"},
        
        # Technique (Техника) - encompasses Coordination
        {"name": "Жонглирование", "unit": "раз", "category": "technique", "description": "Жонглирование мячом"},
        
        # Discipline (Дисциплина) - new
        {"name": "Посещаемость", "unit": "%", "category": "discipline", "description": "Процент посещаемости"},
        
        # Anthropometry (Антропометрия) -> Physical? Or keep separate? 
        # User asked for "Technique, Physical, Discipline, Tactics, Speed".
        # Height/Weight usually go to Physical or Profile. Let's put them in Physical for now or keep separate if frontend maps them.
        # Frontend maps 'anthropometry' to 'physical'.
        {"name": "Рост", "unit": "см", "category": "physical", "description": "Рост"},
        {"name": "Вес", "unit": "кг", "category": "physical", "description": "Вес"},
    ]
    
    created = []
    for test in defaults:
        exists = db.query(PhysicalTest).filter(PhysicalTest.name == test["name"]).first()
        if not exists:
            new_test = PhysicalTest(**test)
            db.add(new_test)
            created.append(test["name"])
            
    db.commit()
    return {"message": f"Created {len(created)} default tests", "tests": created}
