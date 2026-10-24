
import { ApiError } from "./ApiError.js";
 
// Per-user daily quota, charged only on cache MISSES (real Spoonacular calls).
const usage = new Map(); // userId -> { day, count }
 
const limit = () => Number(process.env.DAILY_SEARCH_LIMIT || 20);
const today = () => new Date().toISOString().slice(0, 10);
 
const consumeQuota = (userId) => {
  const day = today();
  let u = usage.get(userId);
  if (!u || u.day !== day) u = { day, count: 0 };
 
  if (u.count >= limit()) {
    throw new ApiError(
      429,
      `Daily search limit of ${limit()} reached. Try again tomorrow.`
    );
  }
  u.count += 1;
  usage.set(userId, u);
};
 
const getQuota = (userId) => {
  const u = usage.get(userId);
  const used = u && u.day === today() ? u.count : 0;
  return { used, limit: limit(), remaining: Math.max(0, limit() - used) };
};
 
export { consumeQuota, getQuota };