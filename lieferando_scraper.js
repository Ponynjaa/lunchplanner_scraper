import * as fsp from "fs/promises";
import { parse } from "node-html-parser";
import { Takeaway, TakeawayConfig } from 'takeaway';
import 'dotenv/config';

const format = (content) => {
	return content ? content.trim().replace(/[\t\r]*/g, '').replace(/\n/g, ' ') : null;
}

const main = async () => {
	// const html = await fsp.readFile('./restaurants.html');
	// const root = parse(html);
	// const results = root.querySelectorAll('[data-qa="restaurant-card"]');
	// for (const result of results) {
	// 	const name = format(result.querySelector('[data-qa="restaurant-info-name"]')?.textContent);
	// 	const deliveryCosts = format(result.querySelector('[data-qa="delivery-costs-indicator-content"]')?.textContent);
	// 	const minCosts = format(result.querySelector('[data-qa="mov-indicator-content"]')?.textContent);
	// 	const promotedDeliveryCosts = format(result.querySelector('[data-qa="promoted-delivery-costs-indicator-content"]')?.textContent);
	// 	const deliveryTime = format(result.querySelector('[data-qa="shipping-time-indicator-content"]')?.textContent);
	// 	const link = result.parentNode.getAttribute('href');
	// 	console.log({ name, minCosts, deliveryCosts, promotedDeliveryCosts, deliveryTime, link });
	// }

	const config = new TakeawayConfig({
		language: 'de',
		url: 'https://de.citymeal.com/android/android.php',
		appVersion: '10.26.0' // TODO: may scrape from https://play.google.com/store/apps/details?id=com.yopeso.lieferando&hl=de&gl=US&pli=1
	});

	// Initialize Takeaway API
	const takeaway = new Takeaway(config);

	// Fetch country
	const country = await takeaway.getCountryById('DE');

	// Login to the country specific site
	// const user = await country.login(process.env.LIEFERANDO_USERNAME, process.env.LIEFERANDO_PASSWORD);
	// => doesnt seem to be necessary

	// Request restaurants list for area
	const restaurants = await country.getRestaurants('94469', '48.83875', '12.94523'); // TODO: move to config or smth

	for (const restaurant of restaurants) {
		const categories = await restaurant.getMenu('94469'); // TODO: move to config or smth
		for (const category of categories) {
			const products = category.products;
			for (const product of products) {
				console.log(product.options[0].choices);
				break;
			}
			break;
		}
		break;
	}
}

main();
