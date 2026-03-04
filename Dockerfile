# Используем официальный легкий образ Nginx
FROM nginx:alpine

# Удаляем стандартный конфиг Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Копируем наш кастомный конфиг (для поддержки SPA/React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Эта папка будет перезаписана при монтировании volume,
# но мы можем создать её пустой для уверенности
RUN mkdir -p /usr/share/nginx/html

# Nginx слушает порт 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
