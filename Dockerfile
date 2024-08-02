# Sử dụng Node.js 20.10 làm base image
FROM node:20.10

# Thiết lập thư mục làm việc trong container
WORKDIR /usr/src/app

# Sao chép package.json và package-lock.json (nếu có)
COPY package*.json ./

# Cài đặt các dependencies
RUN npm install

# Sao chép toàn bộ mã nguồn của bạn vào container
COPY . .

# Expose cổng mà ứng dụng của bạn sẽ chạy
EXPOSE 3000

# Khởi chạy ứng dụng
CMD ["node", "bot.js"]
