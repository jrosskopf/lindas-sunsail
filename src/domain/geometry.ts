import type { Vec2, Vec3, Anchor, Sail } from '../store/useProjectStore';

/**
 * Checks if a 2D point is inside a polygon using ray-casting.
 */
export function isPointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculates the 2D distance between two points.
 */
export function getDistance2D(p1: Vec2, p2: Vec2): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Calculates the bearing (angle relative to North/y-axis) in degrees, clockwise.
 */
export function getBearing(p1: Vec2, p2: Vec2): number {
  // Plan space: +y is North, +x is East
  // Math.atan2(dx, dy) gives angle in radians from +y (North) clockwise.
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  if (angle < 0) {
    angle += 360;
  }
  return angle;
}

/**
 * Splits a sail polygon into triangles based on the roller axis if present.
 * Returns an array of triplets of anchor IDs.
 */
export function triangulateSail(sail: Sail, _anchors?: Anchor[]): string[][] {
  const ids = sail.anchorIds;
  if (ids.length < 3) return [];
  if (ids.length === 3) return [ids];

  // For a quad (length 4) or more, we split using the roller/wave axis if set
  if (ids.length === 4) {
    const axis = sail.rollerAxis;
    if (axis && axis.startAnchorId && axis.endAnchorId) {
      const startId = axis.startAnchorId;
      const endId = axis.endAnchorId;
      
      const idxStart = ids.indexOf(startId);
      const idxEnd = ids.indexOf(endId);

      // Check if the axis is a diagonal (difference of 2 in a quad)
      if (idxStart !== -1 && idxEnd !== -1 && Math.abs(idxStart - idxEnd) === 2) {
        // Diagonal splits:
        // If axis is index 0 -> 2 (e.g. A-C): Triangles are (0,1,2) and (0,2,3)
        // If axis is index 1 -> 3 (e.g. B-D): Triangles are (1,2,3) and (1,3,0)
        const i0 = Math.min(idxStart, idxEnd);
        const i2 = Math.max(idxStart, idxEnd); // 0 and 2

        if (i0 === 0 && i2 === 2) {
          return [
            [ids[0], ids[1], ids[2]],
            [ids[0], ids[2], ids[3]]
          ];
        } else {
          return [
            [ids[1], ids[2], ids[3]],
            [ids[1], ids[3], ids[0]]
          ];
        }
      }
    }
    // Default diagonal split if no roller axis is set
    return [
      [ids[0], ids[1], ids[2]],
      [ids[0], ids[2], ids[3]]
    ];
  }

  // Fallback for polygon triangulation: simple fan triangulation
  const triangles: string[][] = [];
  for (let i = 1; i < ids.length - 1; i++) {
    triangles.push([ids[0], ids[i], ids[i + 1]]);
  }
  return triangles;
}

/**
 * Generates a high-density triangle mesh in 3D for a single sail triangle,
 * supporting edge inward curvature and interior saddle (hyperbolic paraboloid) deformation.
 */
export function generateSailTriangleMesh(
  v0: Vec3, v1: Vec3, v2: Vec3,
  sail: Sail,
  v0Id: string, v1Id: string, v2Id: string,
  subdivisions: number = 15
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];

  const centroid = {
    x: (v0.x + v1.x + v2.x) / 3,
    y: (v0.y + v1.y + v2.y) / 3,
    z: (v0.z + v1.z + v2.z) / 3
  };

  // Curvature config
  const getEdgeCurvature = (startId: string, endId: string) => {
    // If the edge is along the roller axis, it must be completely straight (0 curvature)
    const isRoller = sail.rollerAxis && 
      ((sail.rollerAxis.startAnchorId === startId && sail.rollerAxis.endAnchorId === endId) ||
       (sail.rollerAxis.startAnchorId === endId && sail.rollerAxis.endAnchorId === startId));
    if (isRoller) return 0;

    const edge = sail.edges.find(e => 
      (e.startAnchorId === startId && e.endAnchorId === endId) || 
      (e.startAnchorId === endId && e.endAnchorId === startId)
    );
    return edge?.edgeType === 'curved' ? edge.curvatureInward : 0;
  };

  const c01 = getEdgeCurvature(v0Id, v1Id);
  const c12 = getEdgeCurvature(v1Id, v2Id);
  const c20 = getEdgeCurvature(v2Id, v0Id);

  const preview = sail.previewModel;
  const isStylized = preview.mode === 'stylized';
  const saddleCurvature = isStylized ? preview.curvature : 0;
  const sagAmount = isStylized ? preview.sag : 0;

  // Map to store grid vertex index
  const indexMap: { [key: string]: number } = {};
  let vertIndex = 0;

  // 1. Generate vertices using barycentric subdivision
  for (let i = 0; i <= subdivisions; i++) {
    for (let j = 0; j <= subdivisions - i; j++) {
      const u = i / subdivisions;
      const v = j / subdivisions;
      const w = 1 - u - v;

      // Base linear interpolation
      let px = u * v0.x + v * v1.x + w * v2.x;
      let py = u * v0.y + v * v1.y + w * v2.y;
      let pz = u * v0.z + v * v1.z + w * v2.z;

      // Apply Inward Edge Curvature
      // If a point is close to an edge, we pull it toward the centroid.
      // - Close to Edge 01: w is small
      // - Close to Edge 12: u is small
      // - Close to Edge 20: v is small
      let pullX = 0;
      let pullY = 0;

      // Edge 01 (w = 0, connecting v0 and v1): pull factor proportional to u*v
      if (c01 > 0) {
        const factor = 4 * u * v * (1 - w); // max at midpoint, 0 at corners
        const edgeMidX = (v0.x + v1.x) / 2;
        const edgeMidY = (v0.y + v1.y) / 2;
        const dirX = centroid.x - edgeMidX;
        const dirY = centroid.y - edgeMidY;
        const dist = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
        pullX += (dirX / dist) * c01 * factor;
        pullY += (dirY / dist) * c01 * factor;
      }

      // Edge 12 (u = 0, connecting v1 and v2)
      if (c12 > 0) {
        const factor = 4 * v * w * (1 - u);
        const edgeMidX = (v1.x + v2.x) / 2;
        const edgeMidY = (v1.y + v2.y) / 2;
        const dirX = centroid.x - edgeMidX;
        const dirY = centroid.y - edgeMidY;
        const dist = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
        pullX += (dirX / dist) * c12 * factor;
        pullY += (dirY / dist) * c12 * factor;
      }

      // Edge 20 (v = 0, connecting v2 and v0)
      if (c20 > 0) {
        const factor = 4 * w * u * (1 - v);
        const edgeMidX = (v2.x + v0.x) / 2;
        const edgeMidY = (v2.y + v0.y) / 2;
        const dirX = centroid.x - edgeMidX;
        const dirY = centroid.y - edgeMidY;
        const dist = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
        pullX += (dirX / dist) * c20 * factor;
        pullY += (dirY / dist) * c20 * factor;
      }

      px += pullX;
      py += pullY;

      // Apply Saddle / Sag deformation
      if (isStylized) {
        // A classic saddle shape has a high diagonal and low diagonal.
        // For our barycentric grid, we can apply an elegant parabolic curve
        // centered around the barycentric midpoint (1/3, 1/3, 1/3).
        const distFromCentroidSq = (u - 1/3)**2 + (v - 1/3)**2 + (w - 1/3)**2;
        
        // We model a gentle saddle by raising/lowering depending on barycentric parameters:
        // A simple formula is: -saddleCurvature * (u - v) * (w - 0.2) + sag
        const saddleOffset = -saddleCurvature * 2.5 * (u - v) * (w - 0.2);
        
        // Gravity-like sag: pulls the center downwards
        const sagOffset = -sagAmount * 3.0 * (1 - 3 * distFromCentroidSq) * (u * v * w * 27);

        pz += saddleOffset + sagOffset;
      }

      positions.push(px, py, pz);
      indexMap[`${i},${j}`] = vertIndex++;
    }
  }

  // 2. Triangulate the generated grid vertices
  for (let i = 0; i < subdivisions; i++) {
    for (let j = 0; j < subdivisions - i; j++) {
      // Vertex coordinates
      const current = indexMap[`${i},${j}`];
      const nextU = indexMap[`${i + 1},${j}`];
      const nextV = indexMap[`${i},${j + 1}`];

      // Left-facing triangle
      if (current !== undefined && nextU !== undefined && nextV !== undefined) {
        indices.push(current, nextU, nextV);
      }

      // Right-facing triangle (in between grid units)
      // the diagonal opposite index is (i+1, j-1) or similar if it fits inside subdivisions.
      if (j > 0) {
        const diag = indexMap[`${i + 1},${j - 1}`];
        if (current !== undefined && diag !== undefined && nextU !== undefined) {
          indices.push(current, diag, nextU);
        }
      }
    }
  }

  return { positions, indices };
}

/**
 * Calculates the real-time shadow coverage percentage on the terrace.
 * Utilizes a fast and highly robust 2D grid sampling approach.
 */
export function calculateTerraceShadeKPI(
  terracePoints: Vec2[],
  projectedSailShadows: Vec2[][],
  projectedObstacles: Vec2[][],
  gridResolution: number = 25 // 25x25 grid is extremely fast and accurate
): { percentage: number; totalPoints: number; shadedPoints: number } {
  if (terracePoints.length < 3) return { percentage: 0, totalPoints: 0, shadedPoints: 0 };

  // 1. Find bounding box of terrace
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  terracePoints.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0) return { percentage: 0, totalPoints: 0, shadedPoints: 0 };

  let totalPoints = 0;
  let shadedPoints = 0;

  // 2. Perform grid sampling inside the terrace bounding box
  for (let i = 0; i <= gridResolution; i++) {
    for (let j = 0; j <= gridResolution; j++) {
      const testPoint: Vec2 = {
        x: minX + (i / gridResolution) * width,
        y: minY + (j / gridResolution) * height,
      };

      // Check if point is inside the terrace polygon
      if (isPointInPolygon(testPoint, terracePoints)) {
        totalPoints++;

        // Check if point is inside any sail shadow
        let isShaded = false;
        for (const shadowPoly of projectedSailShadows) {
          if (isPointInPolygon(testPoint, shadowPoly)) {
            isShaded = true;
            break;
          }
        }

        // Check if point is inside any obstacle shadow
        if (!isShaded) {
          for (const obsPoly of projectedObstacles) {
            if (isPointInPolygon(testPoint, obsPoly)) {
              isShaded = true;
              break;
            }
          }
        }

        if (isShaded) {
          shadedPoints++;
        }
      }
    }
  }

  const percentage = totalPoints === 0 ? 0 : Math.round((shadedPoints / totalPoints) * 100);

  return { percentage, totalPoints, shadedPoints };
}

/**
 * Calculates slope warning diagnostics.
 * Installer recommendation: Minimum 25% (14 degrees) slope is recommended for water drainage.
 */
export function checkSlopeWarning(sail: Sail, anchors: Anchor[]): {
  hasWarning: boolean;
  minSlopePercent: number;
  message: string;
} {
  const sailAnchors = anchors.filter(a => sail.anchorIds.includes(a.id));
  if (sailAnchors.length < 3) {
    return { hasWarning: false, minSlopePercent: 0, message: '' };
  }

  // Find the highest and lowest anchor points
  let maxZ = -Infinity;
  let minZ = Infinity;
  let maxAnchor: Anchor | null = null;
  let minAnchor: Anchor | null = null;

  for (const a of sailAnchors) {
    if (a.z > maxZ) {
      maxZ = a.z;
      maxAnchor = a;
    }
    if (a.z < minZ) {
      minZ = a.z;
      minAnchor = a;
    }
  }

  if (!maxAnchor || !minAnchor || maxAnchor.id === minAnchor.id) {
    return { hasWarning: false, minSlopePercent: 0, message: '' };
  }

  // Horizontal distance
  const d2d = getDistance2D(maxAnchor.pos2d, minAnchor.pos2d);
  if (d2d < 0.1) {
    return { hasWarning: false, minSlopePercent: 0, message: '' };
  }

  const slope = (maxZ - minZ) / d2d;
  const slopePercent = Math.round(slope * 100);

  if (slope < 0.25) {
    return {
      hasWarning: true,
      minSlopePercent: slopePercent,
      message: `Slope between ${maxAnchor.label} and ${minAnchor.label} is only ${slopePercent}% (recommended: ≥25% for rain drainage). Rainwater pooling may occur.`
    };
  }

  return {
    hasWarning: false,
    minSlopePercent: slopePercent,
    message: `Perfect! Slope is ${slopePercent}%, which ensures sufficient rain runoff.`
  };
}
