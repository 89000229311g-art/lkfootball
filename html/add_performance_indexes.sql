-- Скрипт для создания индексов производительности
-- Для масштабирования до 1000+ пользователей

-- Students table - критичные поля для поиска
CREATE INDEX IF NOT EXISTS idx_students_parent_phone ON students(parent_phone);
CREATE INDEX IF NOT EXISTS idx_students_group_id ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_group_status ON students(group_id, status);

-- Student Guardians - связи родитель-ученик
CREATE INDEX IF NOT EXISTS idx_guardians_user_id ON student_guardians(user_id);
CREATE INDEX IF NOT EXISTS idx_guardians_student_id ON student_guardians(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_user_student ON student_guardians(user_id, student_id);

-- Attendance - посещаемость (частые запросы)
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendances(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event_id ON attendances(event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendances(date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendances(status);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendances(student_id, date);

-- Payments - платежи (финансовая аналитика)
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_payment_period ON payments(payment_period);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_student_date ON payments(student_id, payment_date);

-- Users - пользователи
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Groups - группы
CREATE INDEX IF NOT EXISTS idx_groups_coach_id ON groups(coach_id);

-- Events - события
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_group_id ON events(group_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- Проверка созданных индексов
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
