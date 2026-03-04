from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.models.invoice_item import InvoiceItem, InvoiceItemType
from app.models.payment import Payment
from app.models.student import Student
from datetime import datetime, date
from typing import List, Dict, Any

class BillingService:
    @staticmethod
    def get_student_billing_history(db: Session, student_id: int) -> Dict[str, Any]:
        """
        Get detailed billing history for a student.
        """
        # Get all payments/invoices
        payments = db.query(Payment).filter(
            Payment.student_id == student_id,
            Payment.deleted_at == None
        ).order_by(desc(Payment.payment_date)).all()
        
        # Calculate summary
        total_invoiced = 0
        total_paid = 0
        
        invoices_data = []
        
        for payment in payments:
            # Check if this payment has detailed items
            items = payment.invoice_items
            
            payment_data = {
                "id": payment.id,
                "amount": payment.amount,
                "date": payment.payment_date.isoformat() if payment.payment_date else None,
                "period": payment.payment_period.isoformat() if payment.payment_period else None,
                "status": payment.status,
                "created_at": payment.created_at.isoformat() if payment.created_at else None,
                "items": []
            }
            
            if items:
                for item in items:
                    payment_data["items"].append({
                        "item_type": item.item_type,
                        "description": item.description,
                        "quantity": item.quantity,
                        "unit_price": item.unit_price,
                        "total_price": item.total_price
                    })
            else:
                # Legacy or manual payment without details
                payment_data["items"].append({
                    "item_type": "other",
                    "description": payment.description or "Оплата за обучение",
                    "quantity": 1,
                    "unit_price": payment.amount,
                    "total_price": payment.amount
                })
            
            invoices_data.append(payment_data)
            
            # Summary logic (simplified)
            if payment.status == "completed":
                total_paid += payment.amount
            
            # Total invoiced is tricky without strict invoice separation
            # For now, assume all payments are against some invoice value
            total_invoiced += payment.amount 
        
        # Balance calculation
        student = db.query(Student).get(student_id)
        current_balance = student.balance if student else 0
        
        return {
            "summary": {
                "total_invoiced": total_invoiced,
                "total_paid": total_paid,
                "balance": current_balance
            },
            "invoices": invoices_data
        }
