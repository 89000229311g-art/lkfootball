import sys
import os
from sqlalchemy import create_engine, func, extract
from sqlalchemy.orm import sessionmaker
from datetime import date, datetime, timedelta

sys.path.append(os.getcwd())

from app.core.config import settings
from app.models import Payment

def debug_financials():
    engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        now = datetime.now()
        this_month = now.month
        this_year = now.year
        
        print(f"DEBUGGING FINANCIALS for {this_year}-{this_month}")
        print("-" * 50)
        
        # 1. DASHBOARD LOGIC (app/routers/stats.py)
        # Revenue this month
        dashboard_month_revenue = db.query(func.sum(Payment.amount)).filter(
            Payment.status == 'completed',
            Payment.deleted_at.is_(None),
            extract('month', func.coalesce(Payment.payment_period, Payment.payment_date)) == this_month,
            extract('year', func.coalesce(Payment.payment_period, Payment.payment_date)) == this_year
        ).scalar() or 0.0
        
        dashboard_total_revenue = db.query(func.sum(Payment.amount)).filter(
            Payment.status == 'completed',
            Payment.deleted_at.is_(None)
        ).scalar() or 0.0
        
        print(f"DASHBOARD (stats.py):")
        print(f"  Revenue (Month): {dashboard_month_revenue}")
        print(f"  Total Revenue:   {dashboard_total_revenue}")
        print("-" * 50)
        
        # 2. ANALYTICS LOGIC (app/routers/analytics.py)
        # Total Revenue Cached
        analytics_total = db.query(func.sum(Payment.amount)).filter(
            Payment.status == "completed"
            # Note: MISSING deleted_at check in actual code
        ).scalar() or 0.0
        
        print(f"ANALYTICS (analytics.py):")
        print(f"  Total Revenue:   {analytics_total} (Should match Dashboard if deleted are 0)")
        
        # Check deleted payments amount
        deleted_amount = db.query(func.sum(Payment.amount)).filter(
            Payment.status == "completed",
            Payment.deleted_at.is_not(None)
        ).scalar() or 0.0
        print(f"  Deleted Revenue: {deleted_amount}")
        print(f"  Valid + Deleted: {dashboard_total_revenue + deleted_amount}")
        print("-" * 50)
        
        # 3. PAYMENTS LOGIC (app/routers/payments.py)
        # Revenue this month (using payment_date strictly)
        # Assuming current month logic from get_payment_periods_summary
        
        # Текущий месяц
        today = date.today()
        current_month_start = today.replace(day=1)
        # Handle month rollover for end date
        if today.month == 12:
            current_month_end = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            current_month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)
            
        payments_month_query = db.query(Payment).filter(
            Payment.payment_date >= current_month_start,
            Payment.payment_date <= current_month_end,
            Payment.status == 'completed',
            Payment.deleted_at.is_(None)
        ).all()
        payments_month_revenue = sum(p.amount for p in payments_month_query)
        
        # Total Revenue (All time)
        payments_total_query = db.query(Payment).filter(
            Payment.status == 'completed',
            Payment.deleted_at.is_(None)
        ).all()
        payments_total_revenue = sum(p.amount for p in payments_total_query)
        
        print(f"PAYMENTS (payments.py):")
        print(f"  Revenue (Month): {payments_month_revenue}")
        print(f"  Total Revenue:   {payments_total_revenue}")
        print("-" * 50)
        
        # 4. DASHBOARD VS PAYMENTS MONTH DISCREPANCY
        # Dashboard uses coalesce(payment_period, payment_date)
        # Payments uses payment_date
        
        print("INVESTIGATING MONTHLY DISCREPANCY:")
        
        # Payments where payment_date is in this month, but payment_period is NOT
        shifted_out = db.query(Payment).filter(
            Payment.status == 'completed',
            Payment.deleted_at.is_(None),
            Payment.payment_date >= current_month_start,
            Payment.payment_date <= current_month_end,
            (extract('month', Payment.payment_period) != this_month) | 
            (extract('year', Payment.payment_period) != this_year)
        ).all()
        
        print(f"  Payments in this month (by Date) but for other periods: {len(shifted_out)}")
        for p in shifted_out:
            print(f"    ID: {p.id}, Amount: {p.amount}, Date: {p.payment_date}, Period: {p.payment_period}")
            
        # Payments where payment_period is in this month, but payment_date is NOT
        shifted_in = db.query(Payment).filter(
            Payment.status == 'completed',
            Payment.deleted_at.is_(None),
            extract('month', Payment.payment_period) == this_month,
            extract('year', Payment.payment_period) == this_year,
            (Payment.payment_date < current_month_start) | 
            (Payment.payment_date > current_month_end)
        ).all()
        
        print(f"  Payments for this period (by Period) but paid in other months: {len(shifted_in)}")
        for p in shifted_in:
            print(f"    ID: {p.id}, Amount: {p.amount}, Date: {p.payment_date}, Period: {p.payment_period}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug_financials()
