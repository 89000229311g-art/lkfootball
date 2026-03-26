#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Настройка сервера Sunny Football Academy ===${NC}"
echo -e "${YELLOW}Структура: /root/lksunnyfootball (настройки) + /root/lksunnyfootball/html (проект)${NC}"

# 1. Проверка наличия .env файла
if [ ! -f .env ]; then
    echo -e "${YELLOW}Файл .env не найден. Создаю из примера...${NC}"
    # Пытаемся найти пример в папке html или текущей
    if [ -f html/.env.production.example ]; then
        cp html/.env.production.example .env
        echo -e "${GREEN}Файл .env создан. ПОЖАЛУЙСТА, ОТРЕДАКТИРУЙТЕ ЕГО ПЕРЕД ЗАПУСКОМ!${NC}"
    elif [ -f .env.production.example ]; then
        cp .env.production.example .env
        echo -e "${GREEN}Файл .env создан. ПОЖАЛУЙСТА, ОТРЕДАКТИРУЙТЕ ЕГО ПЕРЕД ЗАПУСКОМ!${NC}"
    else
        echo -e "${RED}Ошибка: .env.production.example не найден ни в текущей папке, ни в ./html!${NC}"
        # Создаем минимальный .env если примера нет
        touch .env
        echo "DOMAIN=sunnyfootball.com" >> .env
        echo "ACME_EMAIL=admin@sunnyfootball.com" >> .env
        echo "POSTGRES_USER=postgres" >> .env
        echo "POSTGRES_PASSWORD=CHANGE_ME" >> .env
        echo "POSTGRES_DB=football_academy" >> .env
        echo "SECRET_KEY=CHANGE_ME_SECRET" >> .env
        echo -e "${YELLOW}Создан пустой шаблон .env. Заполните его!${NC}"
    fi
else
    echo -e "${GREEN}Файл .env найден.${NC}"
fi

# 2. Создание необходимых директорий
echo -e "${YELLOW}Создание директорий...${NC}"
# Системные папки в корне
mkdir -p backups
mkdir -p letsencrypt
mkdir -p nginx_logs

# Папки проекта внутри html
if [ -d "html" ]; then
    mkdir -p html/logs
    mkdir -p html/uploads
else
    echo -e "${RED}Ошибка: Папка html не найдена! Вы должны скопировать файлы проекта в папку html.${NC}"
    exit 1
fi

# 3. Сборка фронтенда
echo -e "${YELLOW}Сборка фронтенда...${NC}"
if [ -d "html/frontend" ]; then
    cd html/frontend
    if command -v npm &> /dev/null; then
        echo "Установка зависимостей..."
        npm install
        echo "Сборка проекта..."
        npm run build
    else
        echo -e "${RED}Ошибка: npm не найден. Установите Node.js и npm.${NC}"
        exit 1
    fi
    cd ../..
else
    echo -e "${RED}Ошибка: Папка html/frontend не найдена!${NC}"
    exit 1
fi

# 4. Запуск Docker Compose
echo -e "${YELLOW}Запуск контейнеров...${NC}"

if command -v docker-compose &> /dev/null; then
    docker-compose up -d --build
    echo -e "${GREEN}Сервер успешно запущен!${NC}"
    echo -e "Проверьте статус: ${YELLOW}docker-compose ps${NC}"
elif command -v docker &> /dev/null; then
    docker compose up -d --build
    echo -e "${GREEN}Сервер успешно запущен!${NC}"
    echo -e "Проверьте статус: ${YELLOW}docker compose ps${NC}"
else
    echo -e "${RED}Ошибка: docker-compose не найден. Установите Docker.${NC}"
    exit 1
fi
