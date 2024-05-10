import pg from 'pg';
const { Pool } = pg;

const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbHost = process.env.DB_HOST;
const dbName = process.env.DB_NAME;

const pool = new Pool({
	user: dbUser,
	password: dbPassword,
	host: dbHost,
	port: 5432,
	database: dbName
});

export default function connectToDatabase() {
	pool.on('connect', () => {
		console.log('Connected to the database');
	});

	pool.on('error', (err) => {
		console.error('Error connecting to the database:');
		throw err;
	});

	return pool;
}
