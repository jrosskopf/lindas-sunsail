import SunCalc from 'suncalc';

export interface SunPosition {
  azimuthDeg: number;   // True azimuth in degrees (0 = North, 90 = East, 180 = South, 270 = West)
  elevationDeg: number; // Elevation in degrees (0 at horizon, 90 at zenith)
  vector: { x: number; y: number; z: number }; // Rotated plan-space sun vector
  isUp: boolean;
}

/**
 * Computes the sun vector in the plan coordinate system.
 * plan coordinates: +y is Up (North), +x is Right (East), +z is Height (Up)
 * 
 * @param date Current date
 * @param lat Latitude (decimal degrees)
 * @param lon Longitude (decimal degrees)
 * @param northOffsetDeg Plan rotation offset relative to true North (clockwise degrees)
 */
export function getSunPosition(
  date: Date,
  lat: number,
  lon: number,
  northOffsetDeg: number
): SunPosition {
  // SunCalc returns:
  // - azimuth: 0 = South, positive towards West (clockwise), negative towards East (counterclockwise)
  // - altitude: radians above horizon
  const raw = SunCalc.getPosition(date, lat, lon);

  const elevationRad = raw.altitude;
  const azimuthRad = raw.azimuth;

  const elevationDeg = elevationRad * (180 / Math.PI);
  
  // Convert SunCalc azimuth to standard geographical degrees (0 = North, 90 = East, 180 = South, 270 = West)
  let azimuthDeg = (azimuthRad * (180 / Math.PI) + 180) % 360;
  if (azimuthDeg < 0) {
    azimuthDeg += 360;
  }

  // Determine if the sun is above the horizon
  const isUp = elevationRad > 0.01; // small threshold to avoid division by zero on horizon

  // 1. Calculate true coordinates sun vector:
  // In SunCalc system (0 = South (-y), pi/2 = West (-x), pi = North (+y), -pi/2 = East (+x)):
  // vector components:
  // x = -sin(azimuth) * cos(elevation)
  // y = -cos(azimuth) * cos(elevation)
  // z = sin(elevation)
  const cosEl = Math.cos(elevationRad);
  const sinEl = Math.sin(elevationRad);

  const rawX = -Math.sin(azimuthRad) * cosEl;
  const rawY = -Math.cos(azimuthRad) * cosEl;
  const rawZ = sinEl;

  // 2. Rotate by northOffsetDeg about the Z axis.
  // If the plan is rotated clockwise by alpha relative to True North,
  // to project the sun vector into plan coordinates we must rotate the vector COUNTER-CLOCKWISE by alpha,
  // which is a rotation by -alpha degrees.
  const alphaRad = -northOffsetDeg * (Math.PI / 180);
  const cosAlpha = Math.cos(alphaRad);
  const sinAlpha = Math.sin(alphaRad);

  const x = rawX * cosAlpha - rawY * sinAlpha;
  const y = rawX * sinAlpha + rawY * cosAlpha;
  const z = rawZ;

  return {
    azimuthDeg,
    elevationDeg,
    vector: { x, y, z },
    isUp,
  };
}

/**
 * Projects a 3D coordinate onto the ground plane (z = 0) along the sun vector.
 * 
 * @param pos 3D point (meters)
 * @param sunVec Normalized sun vector
 */
export function projectShadow(
  pos: { x: number; y: number; z: number },
  sunVec: { x: number; y: number; z: number }
): { x: number; y: number } {
  // If the sun is below the horizon or vector is straight down/flat
  if (sunVec.z <= 0.001) {
    return { x: pos.x, y: pos.y }; // no shadow or infinite shadow, return base point
  }

  // Intersect ray pos - t * sunVec with ground plane z = 0
  // pos.z - t * sunVec.z = 0  => t = pos.z / sunVec.z
  const t = pos.z / sunVec.z;
  
  return {
    x: pos.x - t * sunVec.x,
    y: pos.y - t * sunVec.y,
  };
}
