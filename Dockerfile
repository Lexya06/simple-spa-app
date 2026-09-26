FROM node:20-alpine

# Устанавливаем системные зависимости для сборки native C++ модулей (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копируем package.json и package-lock.json для кэширования слоев
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код приложения
COPY . .

# Создаем директорию для загрузки файлов и монтирования томов
RUN mkdir -p uploads

# Указываем порт приложения
EXPOSE 3000

# Переменные окружения по умолчанию
ENV PORT=3000
ENV NODE_ENV=production

# Команда запуска сервера
CMD ["node", "app.js"]
