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

	await pool.query(`DROP TABLE lunchplanner.restaurants_subkitchens`);
	await pool.query(`DROP TABLE lunchplanner.restaurants`);
	await pool.query(`DROP TABLE lunchplanner.subkitchens`);
	await pool.query(`DROP TABLE lunchplanner.kitchens`);

	await pool.query(`CREATE TABLE IF NOT EXISTS lunchplanner.restaurants (
		id serial PRIMARY KEY,
		name text NOT NULL,
		logourl text,
		city text NOT NULL,
		street text NOT NULL,
		delivery boolean NOT NULL,
		pickup boolean NOT NULL
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS lunchplanner.kitchens (
		id int PRIMARY KEY,
		description_de text NOT NULL,
		description_en text NOT NULL,
		imageurl text NOT NULL
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS lunchplanner.subkitchens (
		id int PRIMARY KEY,
		description_de text NOT NULL,
		description_en text NOT NULL,
		kitchen_id int REFERENCES lunchplanner.kitchens(id)
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS lunchplanner.restaurants_subkitchens (
		restaurant_id int REFERENCES lunchplanner.restaurants(id),
		subkitchen_id int REFERENCES lunchplanner.subkitchens(id),
		CONSTRAINT PK_restaurants_subkitchens PRIMARY KEY (restaurant_id, subkitchen_id)
	);`);

	const config = new TakeawayConfig({
		language: 'de',
		url: 'https://de.citymeal.com/android/android.php',
		appVersion: '9999.9999.9999'
	});

	// initialize Takeaway API
	const takeaway = new Takeaway(config);

	// fetch country
	const country = await takeaway.getCountryById('DE');

	for (const kitchen of country.kitchens) {
		try {
			await pool.query(`
				INSERT INTO lunchplanner.kitchens (id, description_de, description_en, imageurl) VALUES ($1, $2, $3, $4)
				ON CONFLICT (id) DO
				UPDATE SET id=$1, description_de=$2, description_en=$3, imageurl=$4;
			`, [
				kitchen.id, kitchen.descriptions.de, kitchen.descriptions.en, kitchen.imageUrl
			]);
		} catch (error) {
			logger.error(`Couldn't insert into kitchens:`, error);
		}

		for (const subKitchen of kitchen.subKitchens) {
			try {
				if (!subKitchen.descriptions.de && !subKitchen.descriptions.en) {
					continue;
				}

				await pool.query(`
					INSERT INTO lunchplanner.subkitchens (id, description_de, description_en, kitchen_id) VALUES ($1, $2, $3, $4)
					ON CONFLICT (id) DO
					UPDATE SET id=$1, description_de=$2, description_en=$3, kitchen_id=$4;
				`, [
					subKitchen.id, subKitchen.descriptions.de, subKitchen.descriptions.en, kitchen.id
				]);
			} catch (error) {
				logger.error(`Couldn't insert into subkitchens:`, error);
			}
		}
	}

	// request restaurants list for area
	const restaurants = await country.getRestaurants(lieferandoConfig.postalCode, lieferandoConfig.latitude, lieferandoConfig.longitude);

	for (const restaurant of restaurants) {
		if (restaurant.name !== 'Tia y Tio') {
			continue;
		}

		console.log('MOOOOOOIN', restaurant.deliveryMethods);
		break;
		// try {
		// 	await pool.query(`
		// 		INSERT INTO lunchplanner.restaurants (id, name, logourl, city, street) VALUES ($1, $2, $3, $4, $5)
		// 		ON CONFLICT (id) DO
		// 		UPDATE SET id=$1, name=$2, logourl=$3, city=$4, street=$5;
		// 	`, [
		// 		restaurant.id, restaurant.name, restaurant.logoUrl, restaurant.address.city, restaurant.address.street
		// 	]);
		// } catch (error) {
		// 	logger.error(`Couldn't insert into restaurants:`, error);
		// }

		// for (const subKitchenId of restaurant.subKitchens.ids) {
		// 	try {
		// 		await pool.query(`
		// 			INSERT INTO lunchplanner.restaurants_subkitchens (restaurant_id, subkitchen_id) VALUES ($1, $2)
		// 			ON CONFLICT (restaurant_id, subkitchen_id) DO
		// 			UPDATE SET restaurant_id=$1, subkitchen_id=$2;
		// 		`, [
		// 			restaurant.id, subKitchenId
		// 		]);
		// 	} catch (error) {
		// 		logger.error(`Couldn't insert into restaurants_subkitchens:`, error);
		// 	}
		// }
	}

	await pool.end();
}

main();
