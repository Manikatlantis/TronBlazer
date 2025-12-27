// src/track_bounds.js
export function getTrackBounds(points, halfWidth = 44, padding = 80) {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  // Add track halfWidth + padding so “arena” fully surrounds the drivable area
  const halfX = (maxX - minX) * 0.5 + halfWidth + padding;
  const halfZ = (maxZ - minZ) * 0.5 + halfWidth + padding;

  return { cx, cz, halfX, halfZ, minX, maxX, minZ, maxZ };
}
