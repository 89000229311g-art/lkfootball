#!/bin/bash

#===============================================================================
#  Football Academy - Production Deployment Script
#  Использование: ./deploy.sh [команда]
#
#  Команды:
#    install     - Первая установка на сервер
#    update      - Обновить приложение
#    start       - Запустить все сервисы
#    stop        - Остановить все сервисы
#    restart     - Перезапустить все сервисы
#    logs        - Показать логи
#    backup      - Создать бэкап базы данных
#    restore     - Восстановить из бэкапа
#    ssl         - Получить SSL сертификат (Let's Encrypt)
#    status      - Проверить статус сервисов
#    help        - Показать справку
#===============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Конфигурация
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="$PROJECT_DIR/backups"
ENV_FILE=".env.production"

#-------------------------------------------------------------------------------
# Функции вывода
#-------------------------------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

#-------------------------------------------------------------------------------
# Проверка зависимостей
#-------------------------------------------------------------------------------
check_dependencies() {
    log_info "Проверка зависимостей..."
    
    local deps=("docker" "docker-compose")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "$dep не установлен!"
            echo "Установите Docker: https://docs.docker.com/engine/install/"
            exit 1
        fi
    done
    
    log_success "Все зависимости установлены"
}

#-------------------------------------------------------------------------------
# Проверка .env файла
#-------------------------------------------------------------------------------
check_env_file() {
    if [ ! -f "$PROJECT_DIR/$ENV_FILE" ]; then
        log_warning "Файл $ENV_FILE не найден!"
        log_info "Создаю из примера..."
        
        if [ -f "$PROJECT_DIR/.env.production.example" ]; then
            cp "$PROJECT_DIR/.env.production.example" "$PROJECT_DIR/$ENV_FILE"
            log_warning "ВАЖНО: Отредактируйте $ENV_FILE перед запуском!"
            echo ""
            echo "Обязательно измените следующие параметры:"
            echo "  - SECRET_KEY (используйте: openssl rand -hex 32)"
            echo "  - POSTGRES_PASSWORD"
            echo "  - DOMAIN_NAME"
            echo ""
            read -p "Нажмите Enter после редактирования файла..."
        else
            log_error "Файл .env.production.example не найден!"
            exit 1
        fi
    fi
    
    # Проверка что SECRET_KEY был изменен
    if grep -q "CHANGE_THIS_SECRET_KEY" "$PROJECT_DIR/$ENV_FILE"; then
        log_error "Измените SECRET_KEY в файле $ENV_FILE!"
        log_info "Сгенерируйте новый ключ: openssl rand -hex 32"
        exit 1
    fi
}

#-------------------------------------------------------------------------------
# Первая установка
#-------------------------------------------------------------------------------
install() {
    log_info "=========================================="
    log_info "  Football Academy - Установка"
    log_info "=========================================="
    
    check_dependencies
    check_env_file
    
    # Создание директорий
    log_info "Создание директорий..."
    mkdir -p "$PROJECT_DIR/uploads/avatars"
    mkdir -p "$PROJECT_DIR/uploads/documents"
    mkdir -p "$PROJECT_DIR/uploads/photos"
    mkdir -p "$PROJECT_DIR/nginx/ssl"
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$PROJECT_DIR/logs"
    
    # Сборка frontend
    if [ -d "$PROJECT_DIR/frontend" ]; then
        log_info "Сборка frontend..."
        cd "$PROJECT_DIR/frontend"
        if command -v npm &> /dev/null; then
            npm install
            npm run build
        else
            log_warning "npm не найден. Пропускаю сборку frontend."
        fi
        cd "$PROJECT_DIR"
    fi
    
    # Сборка и запуск Docker
    log_info "Сборка Docker образов..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
    
    log_info "Запуск сервисов..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    # Ожидание запуска
    log_info "Ожидание запуска сервисов..."
    sleep 10
    
    # Проверка статуса
    status
    
    log_success "=========================================="
    log_success "  Установка завершена!"
    log_success "=========================================="
    echo ""
    echo "Доступ к приложению:"
    echo "  - Web: http://$(hostname -I | awk '{print $1}')"
    echo "  - API: http://$(hostname -I | awk '{print $1}')/api/v1"
    echo "  - Docs: http://$(hostname -I | awk '{print $1}')/docs"
    echo ""
    echo "Следующие шаги:"
    echo "  1. Настройте DNS для вашего домена"
    echo "  2. Получите SSL сертификат: ./deploy.sh ssl"
    echo ""
}

#-------------------------------------------------------------------------------
# Обновление приложения
#-------------------------------------------------------------------------------
update() {
    log_info "=========================================="
    log_info "  Football Academy - Обновление"
    log_info "=========================================="
    
    check_env_file
    
    # Создаем бэкап перед обновлением
    log_info "Создание бэкапа перед обновлением..."
    backup
    
    # Получение последних изменений (если git)
    if [ -d "$PROJECT_DIR/.git" ]; then
        log_info "Получение обновлений из Git..."
        git pull
    fi
    
    # Пересборка frontend
    if [ -d "$PROJECT_DIR/frontend" ]; then
        log_info "Пересборка frontend..."
        cd "$PROJECT_DIR/frontend"
        if command -v npm &> /dev/null; then
            npm install
            npm run build
        fi
        cd "$PROJECT_DIR"
    fi
    
    # Пересборка и перезапуск Docker
    log_info "Пересборка Docker образов..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
    
    log_info "Перезапуск сервисов..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log_success "Обновление завершено!"
}

#-------------------------------------------------------------------------------
# Запуск сервисов
#-------------------------------------------------------------------------------
start() {
    log_info "Запуск сервисов..."
    check_env_file
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    sleep 5
    status
}

#-------------------------------------------------------------------------------
# Остановка сервисов
#-------------------------------------------------------------------------------
stop() {
    log_info "Остановка сервисов..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    log_success "Сервисы остановлены"
}

#-------------------------------------------------------------------------------
# Перезапуск сервисов
#-------------------------------------------------------------------------------
restart() {
    log_info "Перезапуск сервисов..."
    stop
    start
}

#-------------------------------------------------------------------------------
# Логи
#-------------------------------------------------------------------------------
logs() {
    local service=${2:-}
    if [ -n "$service" ]; then
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f "$service"
    else
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f
    fi
}

#-------------------------------------------------------------------------------
# Бэкап базы данных
#-------------------------------------------------------------------------------
backup() {
    log_info "Создание бэкапа базы данных..."
    
    mkdir -p "$BACKUP_DIR"
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$BACKUP_DIR/db_backup_$timestamp.sql"
    
    # Загрузка переменных из .env
    source "$PROJECT_DIR/$ENV_FILE"
    
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
        pg_dump -U "${POSTGRES_USER:-football_admin}" "${POSTGRES_DB:-football_academy}" > "$backup_file"
    
    # Сжатие
    gzip "$backup_file"
    
    log_success "Бэкап создан: ${backup_file}.gz"
    
    # Удаление старых бэкапов (старше 30 дней)
    find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -mtime +30 -delete
    log_info "Старые бэкапы (>30 дней) удалены"
}

#-------------------------------------------------------------------------------
# Восстановление из бэкапа
#-------------------------------------------------------------------------------
restore() {
    local backup_file=$2
    
    if [ -z "$backup_file" ]; then
        log_info "Доступные бэкапы:"
        ls -la "$BACKUP_DIR"/*.gz 2>/dev/null || echo "Бэкапы не найдены"
        echo ""
        read -p "Введите имя файла бэкапа: " backup_file
    fi
    
    if [ ! -f "$backup_file" ]; then
        # Попробуем найти в директории бэкапов
        if [ -f "$BACKUP_DIR/$backup_file" ]; then
            backup_file="$BACKUP_DIR/$backup_file"
        else
            log_error "Файл не найден: $backup_file"
            exit 1
        fi
    fi
    
    log_warning "ВНИМАНИЕ: Это перезапишет текущую базу данных!"
    read -p "Продолжить? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "Отменено"
        exit 0
    fi
    
    log_info "Восстановление из бэкапа: $backup_file"
    
    source "$PROJECT_DIR/$ENV_FILE"
    
    # Распаковка если сжат
    if [[ "$backup_file" == *.gz ]]; then
        gunzip -c "$backup_file" | docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
            psql -U "${POSTGRES_USER:-football_admin}" "${POSTGRES_DB:-football_academy}"
    else
        cat "$backup_file" | docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
            psql -U "${POSTGRES_USER:-football_admin}" "${POSTGRES_DB:-football_academy}"
    fi
    
    log_success "База данных восстановлена!"
}

#-------------------------------------------------------------------------------
# Получение SSL сертификата
#-------------------------------------------------------------------------------
ssl() {
    log_info "Получение SSL сертификата..."
    
    source "$PROJECT_DIR/$ENV_FILE"
    
    if [ -z "$DOMAIN_NAME" ]; then
        read -p "Введите ваш домен (например: academy.example.com): " DOMAIN_NAME
    fi
    
    if [ -z "$SSL_EMAIL" ]; then
        read -p "Введите email для Let's Encrypt: " SSL_EMAIL
    fi
    
    log_info "Получение сертификата для $DOMAIN_NAME..."
    
    # Устанавливаем certbot если не установлен
    if ! command -v certbot &> /dev/null; then
        log_info "Установка certbot..."
        apt-get update && apt-get install -y certbot python3-certbot-nginx
    fi
    
    # Получаем сертификат
    certbot certonly --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "$SSL_EMAIL"
    
    # Копируем сертификаты в директорию nginx
    cp /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem "$PROJECT_DIR/nginx/ssl/"
    cp /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem "$PROJECT_DIR/nginx/ssl/"
    
    log_success "SSL сертификат получен!"
    log_info "Перезапустите nginx: ./deploy.sh restart"
    
    # Добавляем cron для автообновления
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    log_info "Автообновление сертификата настроено (каждый день в 12:00)"
}

#-------------------------------------------------------------------------------
# Статус сервисов
#-------------------------------------------------------------------------------
status() {
    log_info "Статус сервисов:"
    echo ""
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    echo ""
    
    # Проверка health
    log_info "Проверка здоровья API..."
    local health_url="http://localhost:8000/api/v1/health"
    
    if curl -s "$health_url" > /dev/null 2>&1; then
        local health=$(curl -s "$health_url")
        log_success "API работает: $health"
    else
        log_warning "API недоступен (возможно, еще запускается)"
    fi
}

#-------------------------------------------------------------------------------
# Справка
#-------------------------------------------------------------------------------
help() {
    echo "=========================================="
    echo "  Football Academy - Deployment Script"
    echo "=========================================="
    echo ""
    echo "Использование: ./deploy.sh [команда]"
    echo ""
    echo "Команды:"
    echo "  install     - Первая установка на сервер"
    echo "  update      - Обновить приложение (с бэкапом)"
    echo "  start       - Запустить все сервисы"
    echo "  stop        - Остановить все сервисы"
    echo "  restart     - Перезапустить все сервисы"
    echo "  logs [srv]  - Показать логи (опционально: имя сервиса)"
    echo "  backup      - Создать бэкап базы данных"
    echo "  restore     - Восстановить из бэкапа"
    echo "  ssl         - Получить SSL сертификат (Let's Encrypt)"
    echo "  status      - Проверить статус сервисов"
    echo "  help        - Показать эту справку"
    echo ""
    echo "Примеры:"
    echo "  ./deploy.sh install           # Первая установка"
    echo "  ./deploy.sh update            # Обновить приложение"
    echo "  ./deploy.sh logs backend      # Логи только backend"
    echo "  ./deploy.sh backup            # Создать бэкап"
    echo ""
}

#-------------------------------------------------------------------------------
# Главная функция
#-------------------------------------------------------------------------------
main() {
    cd "$PROJECT_DIR"
    
    case "${1:-help}" in
        install)    install ;;
        update)     update ;;
        start)      start ;;
        stop)       stop ;;
        restart)    restart ;;
        logs)       logs "$@" ;;
        backup)     backup ;;
        restore)    restore "$@" ;;
        ssl)        ssl ;;
        status)     status ;;
        help|*)     help ;;
    esac
}

# Запуск
main "$@"
