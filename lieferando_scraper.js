import 'dotenv/config';

import { Takeaway, TakeawayConfig } from 'takeaway';
import lieferandoConfig from "./config/lieferando.config.js";
import db from "./database/db.js";
import winston from 'winston';

async function main () {
	const logger = winston.createLogger({
		level: 'error',
		format: winston.format.json(),
		transports: [
			new winston.transports.File({ filename: 'error.log', level: 'error' })
		]
	});
	const pool = db();

	await pool.query(`CREATE SCHEMA IF NOT EXISTS lunchplanner;`);

	await pool.query(`CREATE TABLE IF NOT EXISTS lunchplanner.restaurants (
		id serial PRIMARY KEY,
		name text UNIQUE NOT NULL,
		logourl text,
		city text NOT NULL,
		street text NOT NULL
	);`);

	const config = new TakeawayConfig({
		language: 'de',
		url: 'https://de.citymeal.com/android/android.php',
		appVersion: '10.26.0' // TODO: may scrape from https://play.google.com/store/apps/details?id=com.yopeso.lieferando&hl=de&gl=US&pli=1
	});

	// initialize Takeaway API
	const takeaway = new Takeaway(config);

	// fetch country
	const country = await takeaway.getCountryById('DE');

	// request restaurants list for area
	const restaurants = await country.getRestaurants(lieferandoConfig.postalCode, lieferandoConfig.latitude, lieferandoConfig.longitude);

	for (const restaurant of restaurants) {
		try {
			await pool.query(`
				INSERT INTO lunchplanner.restaurants (name, logourl, city, street) VALUES ($1, $2, $3, $4)
				ON CONFLICT (name) DO
				UPDATE SET name=$1, logourl=$2, city=$3, street=$4;
			`, [
				restaurant.name, restaurant.logoUrl, restaurant.address.city, restaurant.address.street
			]);
		} catch (error) {
			logger.error(`Couldn't insert into restaurants:`, error);
		}
	}

	await pool.end();
}

main();
