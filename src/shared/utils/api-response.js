/**
 * src/shared/utils/api-response.js — Standardized API Response
 *
 * Ensures all API responses follow a consistent JSON structure.
 */

class ApiResponse {
  /**
   * Send a success response
   * @param {object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {object|array} data - Response data
   * @param {string} [message] - Human-readable message
   */
  static success(res, statusCode, data, message = 'Success') {
    return res.status(statusCode).json({
      status: 'success',
      message,
      data,
    });
  }

  /**
   * 200 OK
   */
  static ok(res, data, message = 'Success') {
    return ApiResponse.success(res, 200, data, message);
  }

  /**
   * 201 Created
   */
  static created(res, data, message = 'Created successfully') {
    return ApiResponse.success(res, 201, data, message);
  }

  /**
   * 204 No Content
   */
  static noContent(res) {
    return res.status(204).send();
  }

  /**
   * Paginated list response
   */
  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      status: 'success',
      message,
      data,
      pagination,
    });
  }
}

module.exports = ApiResponse;
