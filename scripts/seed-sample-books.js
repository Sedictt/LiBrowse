// Seed script for sample books and users
// Run with: node scripts/seed-sample-books.js

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'plv_book_exchange',
    port: process.env.DB_PORT || 3306
};

// Sample users data
const sampleUsers = [
    {
        email: 'john.smith@plv.edu.ph',
        student_no: '21-1234',
        fname: 'John',
        lname: 'Smith',
        course: 'BSIT',
        year: 3,
        phone_no: '09123456789'
    },
    {
        email: 'maria.garcia@plv.edu.ph',
        student_no: '21-5678',
        fname: 'Maria',
        lname: 'Garcia',
        course: 'BSA',
        year: 2,
        phone_no: '09123456790'
    },
    {
        email: 'carlos.rodriguez@plv.edu.ph',
        student_no: '21-9012',
        fname: 'Carlos',
        lname: 'Rodriguez',
        course: 'BSED',
        year: 4,
        phone_no: '09123456791'
    },
    {
        email: 'ana.martinez@plv.edu.ph',
        student_no: '21-3456',
        fname: 'Ana',
        lname: 'Martinez',
        course: 'BSENG',
        year: 3,
        phone_no: '09123456792'
    },
    {
        email: 'jose.lopez@plv.edu.ph',
        student_no: '21-7890',
        fname: 'Jose',
        lname: 'Lopez',
        course: 'BSIT',
        year: 2,
        phone_no: '09123456793'
    }
];

// Sample books data
const sampleBooks = [
    // John Smith's books (BSIT)
    {
        title: 'Introduction to Algorithms',
        author: 'Thomas H. Cormen',
        isbn: '978-0262033848',
        course_code: 'CS101',
        subject: 'Computer Science',
        edition: '3rd Edition',
        publisher: 'MIT Press',
        publication_year: 2009,
        condition_rating: 'excellent',
        description: 'Comprehensive textbook on algorithms and data structures. Perfect condition with minimal highlighting.',
        minimum_credits: 100,
        is_available: true,
        owner_email: 'john.smith@plv.edu.ph'
    },
    {
        title: 'Database System Concepts',
        author: 'Abraham Silberschatz',
        isbn: '978-0078022159',
        course_code: 'CS201',
        subject: 'Database Systems',
        edition: '7th Edition',
        publisher: 'McGraw-Hill',
        publication_year: 2019,
        condition_rating: 'good',
        description: 'Excellent resource for database fundamentals. Some notes in margins but very readable.',
        minimum_credits: 150,
        is_available: false,
        owner_email: 'john.smith@plv.edu.ph'
    },
    {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        isbn: '978-0132350884',
        course_code: 'CS301',
        subject: 'Software Engineering',
        edition: '1st Edition',
        publisher: 'Prentice Hall',
        publication_year: 2008,
        condition_rating: 'fair',
        description: 'Great book for learning clean coding practices. Some wear but content is intact.',
        minimum_credits: 75,
        is_available: true,
        owner_email: 'john.smith@plv.edu.ph'
    },

    // Maria Garcia's books (BSA)
    {
        title: 'Financial Accounting',
        author: 'Jerry J. Weygandt',
        isbn: '978-1119503308',
        course_code: 'ACC101',
        subject: 'Accounting',
        edition: '11th Edition',
        publisher: 'Wiley',
        publication_year: 2018,
        condition_rating: 'excellent',
        description: 'Comprehensive financial accounting textbook. Like new condition.',
        minimum_credits: 200,
        is_available: true,
        owner_email: 'maria.garcia@plv.edu.ph'
    },
    {
        title: 'Managerial Accounting',
        author: 'Ray H. Garrison',
        isbn: '978-1259307416',
        course_code: 'ACC201',
        subject: 'Management Accounting',
        edition: '16th Edition',
        publisher: 'McGraw-Hill',
        publication_year: 2017,
        condition_rating: 'good',
        description: 'Good condition with some highlighting. All pages intact.',
        minimum_credits: 175,
        is_available: true,
        owner_email: 'maria.garcia@plv.edu.ph'
    },

    // Carlos Rodriguez's books (BSED)
    {
        title: 'Educational Psychology',
        author: 'Anita Woolfolk',
        isbn: '978-0134774329',
        course_code: 'EDUC101',
        subject: 'Education',
        edition: '14th Edition',
        publisher: 'Pearson',
        publication_year: 2019,
        condition_rating: 'excellent',
        description: 'Essential textbook for education students. Excellent condition.',
        minimum_credits: 125,
        is_available: true,
        owner_email: 'carlos.rodriguez@plv.edu.ph'
    },
    {
        title: 'Teaching Strategies',
        author: 'Donald C. Orlich',
        isbn: '978-1305960787',
        course_code: 'EDUC201',
        subject: 'Teaching Methods',
        edition: '11th Edition',
        publisher: 'Cengage Learning',
        publication_year: 2017,
        condition_rating: 'good',
        description: 'Practical teaching strategies and methods. Good condition with some notes.',
        minimum_credits: 100,
        is_available: false,
        owner_email: 'carlos.rodriguez@plv.edu.ph'
    },
    {
        title: 'Child Development',
        author: 'Laura E. Berk',
        isbn: '978-0134893644',
        course_code: 'EDUC301',
        subject: 'Child Psychology',
        edition: '9th Edition',
        publisher: 'Pearson',
        publication_year: 2018,
        condition_rating: 'fair',
        description: 'Comprehensive child development textbook. Some wear but readable.',
        minimum_credits: 90,
        is_available: true,
        owner_email: 'carlos.rodriguez@plv.edu.ph'
    },

    // Ana Martinez's books (BSENG)
    {
        title: 'Engineering Mechanics: Statics',
        author: 'Russell C. Hibbeler',
        isbn: '978-0133918922',
        course_code: 'ENG101',
        subject: 'Mechanical Engineering',
        edition: '14th Edition',
        publisher: 'Pearson',
        publication_year: 2016,
        condition_rating: 'excellent',
        description: 'Fundamental statics textbook. Excellent condition with no markings.',
        minimum_credits: 150,
        is_available: true,
        owner_email: 'ana.martinez@plv.edu.ph'
    },
    {
        title: 'Thermodynamics: An Engineering Approach',
        author: 'Yunus A. Cengel',
        isbn: '978-0073398174',
        course_code: 'ENG201',
        subject: 'Thermodynamics',
        edition: '8th Edition',
        publisher: 'McGraw-Hill',
        publication_year: 2015,
        condition_rating: 'good',
        description: 'Comprehensive thermodynamics textbook. Good condition with some highlighting.',
        minimum_credits: 200,
        is_available: true,
        owner_email: 'ana.martinez@plv.edu.ph'
    },
    {
        title: 'Materials Science and Engineering',
        author: 'William D. Callister',
        isbn: '978-1119405498',
        course_code: 'ENG301',
        subject: 'Materials Science',
        edition: '10th Edition',
        publisher: 'Wiley',
        publication_year: 2018,
        condition_rating: 'fair',
        description: 'Materials science textbook. Some wear but all content is readable.',
        minimum_credits: 125,
        is_available: false,
        owner_email: 'ana.martinez@plv.edu.ph'
    },

    // Jose Lopez's books (BSIT)
    {
        title: 'Computer Networks',
        author: 'Andrew S. Tanenbaum',
        isbn: '978-0132126953',
        course_code: 'CS401',
        subject: 'Networking',
        edition: '5th Edition',
        publisher: 'Prentice Hall',
        publication_year: 2010,
        condition_rating: 'good',
        description: 'Comprehensive networking textbook. Good condition with minimal notes.',
        minimum_credits: 180,
        is_available: true,
        owner_email: 'jose.lopez@plv.edu.ph'
    },
    {
        title: 'Operating System Concepts',
        author: 'Abraham Silberschatz',
        isbn: '978-1118063330',
        course_code: 'CS501',
        subject: 'Operating Systems',
        edition: '9th Edition',
        publisher: 'Wiley',
        publication_year: 2012,
        condition_rating: 'excellent',
        description: 'Essential OS textbook. Excellent condition, like new.',
        minimum_credits: 160,
        is_available: true,
        owner_email: 'jose.lopez@plv.edu.ph'
    }
];

async function seedDatabase() {
    let connection;
    
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database successfully');

        // Hash password for all users
        const hashedPassword = await bcrypt.hash('password123', 10);

        // Insert users
        console.log('Inserting sample users...');
        for (const user of sampleUsers) {
            try {
                await connection.execute(`
                    INSERT INTO users (
                        email, student_no, fname, lname, pass_hash, course, year, 
                        phone_no, is_verified, verification_status, credits, created
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'verified', 100, NOW())
                `, [
                    user.email,
                    user.student_no,
                    user.fname,
                    user.lname,
                    hashedPassword,
                    user.course,
                    user.year,
                    user.phone_no
                ]);
                console.log(`✓ Inserted user: ${user.fname} ${user.lname} (${user.email})`);
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    console.log(`⚠ User already exists: ${user.email}`);
                } else {
                    console.error(`✗ Error inserting user ${user.email}:`, error.message);
                }
            }
        }

        // Get user IDs for book insertion
        console.log('Getting user IDs...');
        const emailList = sampleUsers.map(u => u.email);
        const placeholders = emailList.map(() => '?').join(',');
        const [users] = await connection.execute(`SELECT id, email FROM users WHERE email IN (${placeholders})`, emailList);
        
        const userMap = {};
        users.forEach(user => {
            userMap[user.email] = user.id;
        });

        // Insert books
        console.log('Inserting sample books...');
        for (const book of sampleBooks) {
            try {
                const ownerId = userMap[book.owner_email];
                if (!ownerId) {
                    console.error(`✗ Owner not found for book: ${book.title}`);
                    continue;
                }

                await connection.execute(`
                    INSERT INTO books (
                        title, author, isbn, course_code, subject, edition, publisher,
                        publication_year, condition_rating, description, owner_id, 
                        is_available, minimum_credits, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                `, [
                    book.title,
                    book.author,
                    book.isbn,
                    book.course_code,
                    book.subject,
                    book.edition,
                    book.publisher,
                    book.publication_year,
                    book.condition_rating,
                    book.description,
                    ownerId,
                    book.is_available,
                    book.minimum_credits
                ]);
                console.log(`✓ Inserted book: ${book.title} (${book.condition_rating}, ${book.is_available ? 'available' : 'borrowed'})`);
            } catch (error) {
                console.error(`✗ Error inserting book ${book.title}:`, error.message);
            }
        }

        console.log('\n🎉 Database seeding completed successfully!');
        console.log(`📊 Summary:`);
        console.log(`   - Users: ${sampleUsers.length}`);
        console.log(`   - Books: ${sampleBooks.length}`);
        console.log(`   - Available books: ${sampleBooks.filter(b => b.is_available).length}`);
        console.log(`   - Borrowed books: ${sampleBooks.filter(b => !b.is_available).length}`);

    } catch (error) {
        console.error('Database seeding failed:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

// Run the seeding
if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase, sampleUsers, sampleBooks };
