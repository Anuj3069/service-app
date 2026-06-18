/**
 * src/modules/address/address.service.js — Address Business Logic
 *
 * Handles address CRUD with ownership validation,
 * default address management, and address limit enforcement (max 10).
 */

const AppError = require('../../shared/utils/api-error');
const logger = require('../../config/logger');
const addressRepository = require('./address.repository');
const Address = require('./address.model');

class AddressService {
  /**
   * Create a new saved address
   * - Auto-sets as default if it's the user's first address
   * - Enforces max 10 addresses per user
   */
  async createAddress(userId, data) {
    // 1. Check address limit
    const count = await addressRepository.countByUserId(userId);
    if (count >= Address.MAX_ADDRESSES_PER_USER) {
      throw AppError.badRequest(
        `You can save a maximum of ${Address.MAX_ADDRESSES_PER_USER} addresses. Please delete an existing address first.`
      );
    }

    // 2. Auto-set default if first address
    const isFirst = count === 0;

    const address = await addressRepository.create({
      ...data,
      userId,
      isDefault: isFirst ? true : (data.isDefault || false),
    });

    logger.info(`📍 Address created: ${address._id} | User: ${userId} | Label: ${address.label}`);

    return address;
  }

  /**
   * Get all addresses for a user
   */
  async getAddresses(userId) {
    return addressRepository.findByUserId(userId);
  }

  /**
   * Get the default address for a user
   */
  async getDefaultAddress(userId) {
    const address = await addressRepository.getDefault(userId);
    if (!address) {
      throw AppError.notFound('No default address found. Please add an address first.');
    }
    return address;
  }

  /**
   * Update an address
   */
  async updateAddress(userId, addressId, data) {
    const address = await addressRepository.findById(addressId);
    if (!address) {
      throw AppError.notFound('Address not found.');
    }

    if (address.userId.toString() !== userId.toString()) {
      throw AppError.forbidden('You do not have access to this address.');
    }

    // If setting as default, use the atomic method
    if (data.isDefault === true) {
      await addressRepository.setDefault(userId, addressId);
    } else if (data.isDefault === false) {
      // Prevent unsetting the default address without setting another one
      delete data.isDefault;
    }

    const updated = await addressRepository.updateById(addressId, data);
    logger.info(`📍 Address updated: ${addressId} | User: ${userId}`);

    return updated;
  }

  /**
   * Set an address as the default
   */
  async setDefaultAddress(userId, addressId) {
    const address = await addressRepository.findById(addressId);
    if (!address) {
      throw AppError.notFound('Address not found.');
    }

    if (address.userId.toString() !== userId.toString()) {
      throw AppError.forbidden('You do not have access to this address.');
    }

    const updated = await addressRepository.setDefault(userId, addressId);
    logger.info(`📍 Default address set: ${addressId} | User: ${userId}`);

    return updated;
  }

  /**
   * Delete an address
   * - Prevents deleting the last remaining address
   * - If deleting the default, auto-promotes another address
   */
  async deleteAddress(userId, addressId) {
    const address = await addressRepository.findById(addressId);
    if (!address) {
      throw AppError.notFound('Address not found.');
    }

    if (address.userId.toString() !== userId.toString()) {
      throw AppError.forbidden('You do not have access to this address.');
    }

    // Check if it's the last address
    const count = await addressRepository.countByUserId(userId);
    if (count <= 1) {
      throw AppError.badRequest('You must have at least one saved address. Add a new address before deleting this one.');
    }

    await addressRepository.deleteById(addressId);

    // If the deleted address was default, promote the most recent one
    if (address.isDefault) {
      const remaining = await addressRepository.findByUserId(userId);
      if (remaining.length > 0) {
        await addressRepository.setDefault(userId, remaining[0]._id);
        logger.info(`📍 Auto-promoted new default address: ${remaining[0]._id} | User: ${userId}`);
      }
    }

    logger.info(`📍 Address deleted: ${addressId} | User: ${userId}`);

    return { deleted: true };
  }
}

module.exports = new AddressService();
