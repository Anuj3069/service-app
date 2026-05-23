/**
 * src/modules/provider/nearby-workers.routes.js
 *
 * GET /api/v1/user/nearby-workers?categoryId=...&lat=...&lng=...&radius=...
 *
 * Returns active, verified workers near the customer's location
 * who have skills matching any service in the given category.
 */

const { Router } = require('express');
const { authenticate } = require('../../shared/middleware/auth.middleware');
const { Service } = require('../service/service.model');
const providerRepository = require('./provider.repository');
const AppError = require('../../shared/utils/api-error');
const logger = require('../../config/logger');

const router = Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { categoryId, lat, lng, radius } = req.query;

    if (!categoryId) {
      throw AppError.badRequest('categoryId is required');
    }
    if (!lat || !lng) {
      throw AppError.badRequest('lat and lng are required');
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius) || 10; // default 10 km

    if (isNaN(latitude) || isNaN(longitude)) {
      throw AppError.badRequest('lat and lng must be valid numbers');
    }

    // 1. Get all services in this category to collect required skills
    const services = await Service.find({
      category: categoryId,
      isActive: true,
    }).select('requiredSkills');

    if (services.length === 0) {
      return res.status(200).json({
        success: true,
        data: { workers: [] },
      });
    }

    // 2. Collect unique skills from all services in the category
    const skillsSet = new Set();
    services.forEach((s) => {
      (s.requiredSkills || []).forEach((skill) => skillsSet.add(skill));
    });
    const skills = [...skillsSet];

    if (skills.length === 0) {
      return res.status(200).json({
        success: true,
        data: { workers: [] },
      });
    }

    logger.info(`🗺️ Nearby workers query: category=${categoryId}, coords=[${longitude},${latitude}], radius=${searchRadius}km, skills=[${skills}]`);

    // 3. Use existing geo query — findNearbyBySkills uses $near + 2dsphere index
    const providers = await providerRepository.findNearbyBySkills(
      skills,
      [longitude, latitude], // MongoDB expects [lng, lat]
      searchRadius
    );

    // 4. Map to a clean response shape
    const workers = providers.map((p) => {
      // Approximate distance using Haversine formula
      const provCoords = p.location?.coordinates || [0, 0];
      const distKm = haversineDistance(latitude, longitude, provCoords[1], provCoords[0]);

      return {
        id: p._id,
        userId: p.userId?._id || p.userId,
        name: p.userId?.name || 'Provider',
        email: p.userId?.email,
        phone: p.userId?.phone,
        rating: p.rating || 0,
        totalJobs: p.totalJobs || 0,
        totalReviews: p.totalReviews || 0,
        isVerified: p.isVerified,
        coordinates: provCoords,
        distance: Math.round(distKm * 100) / 100, // km, 2 decimal places
        skills: p.skills || [],
      };
    });

    // Sort by distance
    workers.sort((a, b) => a.distance - b.distance);

    res.status(200).json({
      success: true,
      data: {
        workers,
        total: workers.length,
        searchRadius: searchRadius,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Haversine formula to compute distance between two lat/lng points in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

module.exports = router;
