# PLV BookSwap - Peer-to-Peer Book Exchange Platform

A modern, secure book borrowing and lending platform designed specifically for Pamantasan ng Lungsod ng Valenzuela (PLV) students. Built with Node.js, Express.js, and MySQL.

## 🌟 Features

### Core Functionality
- **User Authentication**: Secure registration with OTP email verification
- **Book Management**: Add, search, and browse books by course code, subject, and program
- **Smart Search**: Advanced filtering by program, condition, and course requirements
- **Transaction System**: Complete borrowing/lending workflow with status tracking
- **Credit System**: Reputation-based system with feedback mechanism
- **Notifications**: Real-time updates for all platform activities

### Modern UI/UX
- **Dark Theme**: Inspired by modern DeFi interfaces with gradient accents
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Interactive Dashboard**: Comprehensive user statistics and activity tracking
- **Real-time Updates**: Live notifications and status changes

### Security & Trust
- **PLV Email Verification**: Only verified PLV students can join
- **Credit-based Privileges**: Lenders can set minimum credit requirements
- **Feedback System**: Mutual rating system for borrowers and lenders
- **Secure Authentication**: JWT-based authentication with password hashing

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- XAMPP/WAMP (for local development)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "Book exchange"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   - Start XAMPP/WAMP and ensure MySQL is running
   - Import the database schema:
     ```bash
     mysql -u root -p < database/schema.sql
     ```

4. **Configure environment variables**
   - Copy `.env.example` to `.env` (if exists) or update the existing `.env` file
   - Update the following variables:
     ```env
     # Database Configuration
     DB_HOST=localhost
     DB_USER=root
     DB_PASSWORD=your_mysql_password
     DB_NAME=plv_book_exchange

     # JWT Secret (change this!)
     JWT_SECRET=your_super_secret_jwt_key_here

     # Email Configuration (for OTP)
     EMAIL_HOST=smtp.gmail.com
     EMAIL_PORT=587
     EMAIL_USER=your_gmail@gmail.com
     EMAIL_PASSWORD=your_app_password

     # Server Configuration
     PORT=3000
     NODE_ENV=development
     ```

5. **Set up email authentication**
   - Enable 2-factor authentication on your Gmail account
   - Generate an App Password for the application
   - Use the App Password in the `EMAIL_PASSWORD` field

6. **Run the application**
   ```bash
   # Development mode with auto-restart
   npm run dev

   # Production mode
   npm start
   ```

7. **Access the application**
   - Open your browser and go to `http://localhost:3000`
   - The application will be ready to use!

## 📁 Project Structure

```
Book exchange/
├── config/
│   └── database.js          # Database configuration
├── database/
│   └── schema.sql           # Database schema and sample data
├── middleware/
│   └── auth.js              # Authentication middleware
├── public/
│   ├── css/
│   │   └── style.css        # Modern dark theme styles
│   ├── js/
│   │   ├── main.js          # Main application logic
│   │   ├── api.js           # API client utilities
│   │   ├── auth.js          # Authentication handling
│   │   └── books.js         # Book management
│   └── index.html           # Main application page
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── books.js             # Book management routes
│   ├── users.js             # User profile routes
│   ├── transactions.js      # Transaction management
│   ├── feedback.js          # Feedback system
│   ├── notifications.js     # Notification system
│   └── stats.js             # Platform statistics
├── uploads/                 # File uploads (books, profiles)
├── .env                     # Environment variables
├── package.json             # Dependencies and scripts
├── server.js                # Main server file
└── README.md                # This file
```

## 🎨 Design System

The platform uses a modern dark theme inspired by contemporary DeFi interfaces:

### Color Palette
- **Primary**: Purple gradient (#667eea to #764ba2)
- **Secondary**: Pink gradient (#f093fb to #f5576c)
- **Background**: Dark blue-gray (#1a1b23)
- **Cards**: Translucent dark (#2a2d3a with blur)
- **Text**: White with varying opacity levels

### Key Design Elements
- **Gradient Buttons**: Eye-catching call-to-action elements
- **Glass Morphism**: Translucent cards with backdrop blur
- **Floating Animations**: Subtle movement for visual interest
- **Responsive Grid**: Adapts to all screen sizes

## 🔧 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/verify-otp` - Verify email with OTP
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify JWT token

### Book Management
- `GET /api/books` - Get all books with filtering
- `GET /api/books/search` - Search books
- `POST /api/books` - Add new book
- `GET /api/books/:id` - Get book details
- `PUT /api/books/:id` - Update book
- `DELETE /api/books/:id` - Delete book

### Transaction System
- `POST /api/transactions` - Create borrow request
- `GET /api/transactions` - Get user transactions
- `PUT /api/transactions/:id/status` - Update transaction status

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/stats` - Get user statistics

## 🎯 Target Users

- **Primary**: PLV students in Accountancy, Education, Engineering, and IT programs
- **Use Cases**: 
  - Students needing expensive textbooks for a semester
  - Students wanting to lend books they no longer need
  - Building a trusted community of book sharers

## 🔒 Security Features

- **Email Verification**: Only PLV email addresses (@plv.edu.ph) allowed
- **Password Security**: Bcrypt hashing with salt rounds
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Comprehensive validation on all endpoints
- **Rate Limiting**: Protection against abuse
- **File Upload Security**: Restricted file types and sizes

## 🚀 Deployment

### Local Development
The application is configured to run locally with XAMPP/WAMP for development and testing.

### Production Deployment
For production deployment, consider:
- **Hosting**: Heroku, DigitalOcean, or AWS
- **Database**: MySQL on cloud (AWS RDS, Google Cloud SQL)
- **File Storage**: Cloud storage for uploaded images
- **Environment**: Update NODE_ENV to 'production'

## 🤝 Contributing

This project was developed by the PLV BSIT 3-4 team:
- Hilario, Shanna Louise L.
- Cabigon, Lorraine Isabel B.
- Canon, Bryan Benedict
- Tillo, Joseph Venedict

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support or questions about the PLV BookSwap platform:
1. Check the troubleshooting section below
2. Review the API documentation
3. Contact the development team

## 🔧 Troubleshooting

### Common Issues

**Database Connection Failed**
- Ensure MySQL is running in XAMPP/WAMP
- Check database credentials in `.env`
- Verify the database `plv_book_exchange` exists

**Email Verification Not Working**
- Check Gmail App Password configuration
- Ensure 2FA is enabled on Gmail account
- Verify EMAIL_USER and EMAIL_PASSWORD in `.env`

**File Upload Errors**
- Check if `uploads/` directories exist
- Verify file permissions
- Ensure file size is under limits (5MB for books, 2MB for profiles)

**Port Already in Use**
- Change PORT in `.env` to a different number (e.g., 3001)
- Or stop other applications using port 3000

### Development Tips

- Use `npm run dev` for development with auto-restart
- Check browser console for frontend errors
- Monitor server logs for backend issues
- Use MySQL Workbench or phpMyAdmin to inspect database

---

**Built with ❤️ for the PLV Community**
