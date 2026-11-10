import { asyncHandler } from "../utils/asyncHandler.js"; // Or your standard error handling wrapper
import { ApiResponse } from "../utils/ApiResponse.js";

const getCountryAnalytics = asyncHandler(async (req, res) => {
  try {
    const response = await fetch('https://api.restcountries.com/countries/v5', {
      headers: {
        'Authorization': `Bearer ${process.env.REST_COUNTRIES_API_KEY}`
      }
    });
    
    const data = await response.json();
    
    return res
      .status(200)
      .json(new ApiResponse(200, data, "Country analytics fetched successfully"));
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch country data" });
  }
});

export { getCountryAnalytics };