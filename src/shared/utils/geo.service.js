/**
 * src/shared/utils/geo.service.js — Geolocation & Distance Utilities
 *
 * Uses Google Maps Distance Matrix API for road-based distance & ETA.
 * Falls back to haversine formula if API key is not configured.
 */

const { Client } = require('@googlemaps/google-maps-services-js');
const config = require('../../config');
const logger = require('../../config/logger');

const mapsClient = new Client({});

class GeoService {
  /**
   * Get road-based distance and ETA between two points
   * @param {number[]} origin - [longitude, latitude]
   * @param {number[]} destination - [longitude, latitude]
   * @returns {{ distanceKm: number, durationMinutes: number, durationText: string } | null}
   */
  async getDistanceAndETA(origin, destination) {
    // Try Google Maps first
    if (config.googleMapsApiKey) {
      try {
        const response = await mapsClient.distancematrix({
          params: {
            origins: [{ lat: origin[1], lng: origin[0] }],       // Google uses lat,lng
            destinations: [{ lat: destination[1], lng: destination[0] }],
            mode: 'driving',
            key: config.googleMapsApiKey,
          },
        });

        const element = response.data.rows[0]?.elements[0];
        if (element && element.status === 'OK') {
          return {
            distanceKm: parseFloat((element.distance.value / 1000).toFixed(2)),
            durationMinutes: Math.ceil(element.duration.value / 60),
            durationText: element.duration.text,
          };
        }
      } catch (error) {
        logger.warn('Google Maps API failed, falling back to haversine', { error: error.message });
      }
    }

    // Fallback: Haversine formula (straight-line distance)
    return this._haversine(origin, destination);
  }

  /**
   * Calculate distance-based price surcharge
   */
  calculateDistancePrice(distanceKm, pricePerKm) {
    if (!distanceKm || !pricePerKm || pricePerKm <= 0) return 0;
    return parseFloat((distanceKm * pricePerKm).toFixed(2));
  }

  /**
   * Haversine formula — straight-line distance between two points
   * @private
   */
  _haversine(origin, destination) {
    const R = 6371; // Earth's radius in km
    const [lon1, lat1] = origin;
    const [lon2, lat2] = destination;

    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = parseFloat((R * c).toFixed(2));

    // Rough ETA estimate: assume 30 km/h average city speed
    const durationMinutes = Math.ceil((distanceKm / 30) * 60);

    return {
      distanceKm,
      durationMinutes,
      durationText: `~${durationMinutes} mins (estimated)`,
    };
  }

  _toRad(deg) {
    return deg * (Math.PI / 180);
  }
}

module.exports = new GeoService();
