#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Настройка сервера Sunny Football Academy ===${NC}"

# 1. Проверка наличия .env файла
if [ ! -f .env ]; then
    echo -e "${YELLOW}Файл .env не найден. Создаю из примера...${NC}"
    if [ -f .env.production.example ]; then
        cp .env.production.example .env
        echo -e "${GREEN}Файл .env создан. ПОЖАЛУЙСТА, ОТРЕДАКТИРУЙТЕ ЕГО ПЕРЕД ЗАПУСКОМ!${NC}"
        echo "Вам нужно указать:"
        echo "- DOMAIN (ваш домен)"
        echo "- ACME_EMAIL (email для SSL)"
        echo "- POSTGRES_PASSWORD"
        echo "- SECRET_KEY"
    else
        echo -e "${RED}Ошибка: .env.production.example не найден!${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Файл .env найден.${NC}"
fi

# 2. Создание необходимых директорий
echo -e "${YELLOW}Создание директорий...${NC}"
mkdir -p logs
mkdir -p uploads
mkdir -p backups
mkdir -p letsencrypt
mkdir -p nginx/ssl

# 3. Сборка фронтенда
echo -e "${YELLOW}Сборка фронтенда...${NC}"
if [ -d "frontend" ]; then
    cd frontend
    if command -v npm &> /dev/null; then
        echo "Установка зависимостей..."
        npm install
        echo "Сборка проекта..."
        npm run build
    else
        echo -e "${RED}Ошибка: npm не найден. Установите Node.js и npm.${NC}"
        exit 1
    fi
    cd ..
else
    echo -e "${RED}Ошибка: Папка frontend не найдена!${NC}"
    exit 1
fi

# 4. Запуск Docker Compose
echo -e "${YELLOW}Запуск контейнеров...${NC}"
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker-compose.server.yml up -d --build
    echo -e "${GREEN}Сервер успешно запущен!${NC}"
    echo -e "Проверьте статус: ${YELLOW}docker-compose -f docker-compose.server.yml ps${NC}"
elif command -v docker &> /dev/null; then
    docker compose -f docker-compose.server.yml up -d --build
    echo -e "${GREEN}Сервер успешно запущен!${NC}"
    echo -e "Проверьте статус: ${YELLOW}docker compose -f docker-compose.server.yml ps${NC}"
else
    echo -e "${RED}Ошибка: docker-compose не найден. Установите Docker.${NC}"
    exit 1
fi
