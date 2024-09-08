import 'dotenv/config';

import { Takeaway, TakeawayConfig } from 'takeaway';
import lieferandoConfig from "./config/lieferando.config.js";
import db from "./database/db.js";
import winston from 'winston';

async function main() {
	const logger = winston.createLogger({
		level: 'error',
		format: winston.format.json(),
		transports: [
			new winston.transports.File({ filename: 'error.log', level: 'error' })
		]
	});
	const pool = db();

	await pool.query(`DROP TABLE IF EXISTS users_sessions`);
	await pool.query(`DROP TABLE IF EXISTS restaurant_votes`);
	await pool.query(`DROP TABLE IF EXISTS orders`);
	await pool.query(`DROP TABLE IF EXISTS sessions`);
	await pool.query(`DROP TABLE IF EXISTS users_groups`);
	await pool.query(`DROP TABLE IF EXISTS invites`);
	await pool.query(`DROP TABLE IF EXISTS groups_invites`);
	await pool.query(`DROP TABLE IF EXISTS sessions_invites`);
	await pool.query(`DROP TABLE IF EXISTS users`);
	await pool.query(`DROP TABLE IF EXISTS groups`);
	await pool.query(`DROP TABLE IF EXISTS restaurants_subkitchens`);
	await pool.query(`DROP TABLE IF EXISTS restaurants`);
	await pool.query(`DROP TABLE IF EXISTS subkitchens`);
	await pool.query(`DROP TABLE IF EXISTS kitchens`);

	await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
	await pool.query(`CREATE SEQUENCE IF NOT EXISTS custom_seq`);

	await pool.query(`DROP TYPE IF EXISTS recurrence_type`);
	// await pool.query(`CREATE TYPE recurrence_type AS ENUM ('weekly', 'biweekly', 'triweekly', 'quadweekly');`);
	await pool.query(`DROP TYPE IF EXISTS role`);
	await pool.query(`CREATE TYPE role AS ENUM ('admin', 'regular');`);

	await pool.query(`CREATE TABLE IF NOT EXISTS users (
		id int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		keycloak_id uuid UNIQUE NOT NULL,
		first_name text NOT NULL,
		last_name text NOT NULL,
		image bytea NOT NULL
	);`)

	await pool.query(`CREATE TABLE IF NOT EXISTS groups (
		id int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		name text NOT NULL,
		image bytea NOT NULL,
		mastergroup int REFERENCES groups(id)
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS users_groups (
		group_id int REFERENCES groups(id),
		user_id int REFERENCES users(id),
		role role NOT NULL,
		CONSTRAINT PK_users_groups PRIMARY KEY (group_id, user_id)
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
		id int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		location geography NOT NULL,
		vote_until timestamp NOT NULL,
		order_at timestamp NOT NULL,
		group_id int REFERENCES groups(id) NULL,
		user_id int REFERENCES users(id) NULL
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS groups_invites (
		id int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		group_id int UNIQUE NOT NULL REFERENCES groups(id),
		valid_until timestamp NOT NULL,
		code uuid NOT NULL DEFAULT gen_random_uuid()
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS sessions_invites (
		id int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		session_id int UNIQUE NOT NULL REFERENCES sessions(id),
		valid_until timestamp NOT NULL,
		code uuid NOT NULL DEFAULT gen_random_uuid()
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS users_sessions (
		user_id int REFERENCES users(id),
		session_id int REFERENCES sessions(id),
		CONSTRAINT PK_sessions_users PRIMARY KEY (user_id, session_id)
	);`)

	await pool.query(`CREATE TABLE IF NOT EXISTS orders (
		id int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		user_id int REFERENCES users(id),
		restaurant_id text NOT NULL,
		session_id int REFERENCES sessions(id),
		meal text NOT NULL,
		count int NOT NULL DEFAULT 1
	);`)

	await pool.query(`DROP TYPE IF EXISTS restaurant_type`);
	await pool.query(`CREATE TYPE restaurant_type AS ENUM ('lieferando', 'custom');`);

	await pool.query(`CREATE TABLE IF NOT EXISTS restaurant_votes (
		restaurant_id text NOT NULL,
		type restaurant_type NOT NULL,
		session_id int REFERENCES sessions(id),
		user_id int REFERENCES users(id),
		upvote boolean NOT NULL,
		CONSTRAINT PK_restaurant_votes PRIMARY KEY (restaurant_id, session_id, user_id)
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS restaurants (
		id text PRIMARY KEY DEFAULT 'custom_'||nextval('custom_seq'::regclass),
		name text NOT NULL,
		logo bytea NOT NULL,
		menu bytea NOT NULL,
		city text NOT NULL,
		street text NOT NULL,
		location geography NOT NULL,
		delivery boolean NOT NULL,
		pickup boolean NOT NULL
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS kitchens (
		id int PRIMARY KEY,
		description_de text NOT NULL,
		description_en text NOT NULL,
		imageurl text NOT NULL
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS subkitchens (
		id int PRIMARY KEY,
		description_de text NOT NULL,
		description_en text NOT NULL,
		kitchen_id int REFERENCES kitchens(id)
	);`);

	await pool.query(`CREATE TABLE IF NOT EXISTS restaurants_subkitchens (
		restaurant_id text REFERENCES restaurants(id),
		subkitchen_id int REFERENCES subkitchens(id),
		CONSTRAINT PK_restaurants_subkitchens PRIMARY KEY (restaurant_id, subkitchen_id)
	);`);

	await pool.query(`DROP SCHEMA IF EXISTS lunchplanner;`);

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
				INSERT INTO kitchens (id, description_de, description_en, imageurl) VALUES ($1, $2, $3, $4)
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
					INSERT INTO subkitchens (id, description_de, description_en, kitchen_id) VALUES ($1, $2, $3, $4)
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
		// 		INSERT INTO restaurants (id, name, logourl, city, street) VALUES ($1, $2, $3, $4, $5)
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
		// 			INSERT INTO restaurants_subkitchens (restaurant_id, subkitchen_id) VALUES ($1, $2)
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
