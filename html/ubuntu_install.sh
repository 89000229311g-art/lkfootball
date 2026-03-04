#!/bin/bash

#===============================================================================
#  Football Academy - Автоматическая установка на Ubuntu 24
#  
#  Использование:
#    1. Скопируйте этот скрипт на сервер
#    2. chmod +x ubuntu_install.sh
#    3. sudo ./ubuntu_install.sh
#===============================================================================

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "=========================================="
echo "  Football Academy - Установка на Ubuntu"
echo "=========================================="
echo ""

# Проверка root
if [ "$EUID" -ne 0 ]; then
    log_error "Запустите скрипт с sudo: sudo ./ubuntu_install.sh"
    exit 1
fi

# Получаем реального пользователя (не root)
REAL_USER=${SUDO_USER:-$USER}
PROJECT_DIR="/opt/football-academy"

#-------------------------------------------------------------------------------
# ШАГ 1: Обновление системы
#-------------------------------------------------------------------------------
log_info "Шаг 1/8: Обновление системы..."
apt update && apt upgrade -y
log_success "Система обновлена"

#-------------------------------------------------------------------------------
# ШАГ 2: Установка зависимостей
#-------------------------------------------------------------------------------
log_info "Шаг 2/8: Установка зависимостей..."
apt install -y \
    curl \
    git \
    wget \
    nano \
    ufw \
    ca-certificates \
    gnupg \
    lsb-release
log_success "Зависимости установлены"

#-------------------------------------------------------------------------------
# ШАГ 3: Установка Docker
#-------------------------------------------------------------------------------
log_info "Шаг 3/8: Установка Docker..."

# Удаление старых версий
apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Добавление репозитория Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Добавление пользователя в группу docker
usermod -aG docker $REAL_USER

systemctl enable docker
systemctl start docker

log_success "Docker установлен: $(docker --version)"

#-------------------------------------------------------------------------------
# ШАГ 4: Установка Node.js
#-------------------------------------------------------------------------------
log_info "Шаг 4/8: Установка Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
log_success "Node.js установлен: $(node --version)"

#-------------------------------------------------------------------------------
# ШАГ 5: Настройка файрвола
#-------------------------------------------------------------------------------
log_info "Шаг 5/8: Настройка файрвола..."
ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
log_success "Файрвол настроен"

#-------------------------------------------------------------------------------
# ШАГ 6: Создание директории проекта
#-------------------------------------------------------------------------------
log_info "Шаг 6/8: Подготовка директории проекта..."
mkdir -p $PROJECT_DIR
chown -R $REAL_USER:$REAL_USER $PROJECT_DIR
log_success "Директория создана: $PROJECT_DIR"

#-------------------------------------------------------------------------------
# ГОТОВО - Инструкции
#-------------------------------------------------------------------------------
echo ""
echo "=========================================="
echo -e "${GREEN}  Подготовка сервера завершена!${NC}"
echo "=========================================="
echo ""
echo "Следующие шаги:"
echo ""
echo "1. Скопируйте файлы проекта на сервер:"
echo "   scp -r /путь/к/football-academy-system/* $REAL_USER@$(hostname -I | awk '{print $1}'):$PROJECT_DIR/"
echo ""
echo "2. Или клонируйте из Git:"
echo "   cd $PROJECT_DIR"
echo "   git clone <ваш-репозиторий> ."
echo ""
echo "3. После копирования файлов выполните:"
echo "   cd $PROJECT_DIR"
echo "   cp .env.production.example .env.production"
echo "   nano .env.production   # Измените настройки!"
echo ""
echo "4. Сгенерируйте SECRET_KEY:"
echo "   openssl rand -hex 32"
echo ""
echo "5. Соберите frontend:"
echo "   cd frontend && npm install && npm run build && cd .."
echo ""
echo "6. Запустите проект:"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh install"
echo ""
echo "IP сервера: $(hostname -I | awk '{print $1}')"
echo ""
echo "=========================================="
echo ""

# Перелогин для применения группы docker
log_warning "Выполните 'newgrp docker' или перезайдите для работы с Docker без sudo"
