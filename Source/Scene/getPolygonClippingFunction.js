/**
 * Gets the GLSL functions needed to retrieve clipping planes from a
 * ClippingPolygon's textures.
 *
 * @param {ClippingPolygon} clippingPolygon ClippingPolygon
 * @param {Context} context The current rendering context.
 * @returns {String} A string containing GLSL functions for retrieving clipping planes.
 * @private
 */

function getClippingPolygonFunctions() {
  var insideBoxFn =
    "" +
    "    // https://stackoverflow.com/a/26697650\n" +
    "    float insideBox(vec2 v, vec2 bottomLeft, vec2 topRight) {\n" +
    "        vec2 s = step(bottomLeft, v) - step(topRight, v);\n" +
    "        return s.x * s.y;\n" +
    "    }";

  var pointInTriangle =
    "" +
    "    float sign (vec2 p1, vec2 p2, vec2 p3) {\n" +
    "        return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);\n" +
    "    }\n" +
    "\n" +
    "    // https://stackoverflow.com/a/2049593\n" +
    "    bool pointInTriangle(vec2 p, vec2 v1, vec2 v2, vec2 v3) {\n" +
    "        float d1, d2, d3;\n" +
    "        bool has_neg, has_pos;\n" +
    "\n" +
    "        d1 = sign(p, v1, v2);\n" +
    "        d2 = sign(p, v2, v3);\n" +
    "        d3 = sign(p, v3, v1);\n" +
    "\n" +
    "        has_neg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);\n" +
    "        has_pos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);\n" +
    "\n" +
    "        return !(has_neg && has_pos);\n" +
    "    }";

  var scaleFunction =
    "" +
    "   float scale(float number, float oldMin, float oldMax, float newMin, float newMax) {\n" +
    "        return (((newMax - newMin) * (number - oldMin)) / (oldMax - oldMin)) + newMin;\n" +
    "   }";

  var isWorldPositionInsideAnyTriangle =
    "" +
    "    bool isWorldPositionInsideAnyTriangle(vec2 worldPos, float startIndex, float endIndex) {\n" +
    "        float i = startIndex;\n" +
    "        int numTrianglesToCheck = int((endIndex - startIndex) / 3.0);\n" +
    "        \n" +
    "        for (int k = 0; k < 1000; k++) {\n" +
    "            if  (k >= numTrianglesToCheck) { \n" +
    "                break; \n" +
    "            }\n" +
    "\n" +
    "            // We have to do four dependent texture reads (unfortunately):\n" +
    "            // - One to get the relevant indices for the relevant triangle\n" +
    "            //   under consideration.\n" +
    "            // - Three more to get the XZ positions for the three vertices of\n" +
    "            //   the triangle.\n" +
    "            // The algorithm should still be fast with a sufficient grid size\n" +
    "            // as very few pixels will actually have to loop multiple times\n" +
    "            // and not every triangle in the entire mesh is under consideration\n" +
    "            // (unless the grid size is 0)\n" +
    "\n" +
    "            // We divide by '3' because 'u_clippingPolygonOverlappingTriangleIndices' is now \n" +
    "            // a N/3 array of pixels but these indices still map to the 'N' \n" +
    "            // based array.\n" +
    "            float overlapIndicesPixel = ((i / 3.0) + 0.5) / u_clippingPolygonOverlappingTriangleIndicesNumPixels;\n" +
    "            vec4 overlapIndices = texture2D(u_clippingPolygonOverlappingTriangleIndices, vec2(overlapIndicesPixel, 0.0));\n" +
    "\n" +
    "            // We DO NOT multiply these indices by 3 because there is now a 1:1\n" +
    "            // correspondence between the overlapIndices and their location\n" +
    "            // in 'u_clippingPolygonMeshPositions' due to the pixelation of everything.\n" +
    "            vec3 meshIndices = (overlapIndices.xyz + 0.5) / u_clippingPolygonMeshPositionsNumPixels;\n" +
    "\n" +
    "            vec2 v0 = texture2D(u_clippingPolygonMeshPositions, vec2(meshIndices.x, 0.0)).xz;\n" +
    "            vec2 v1 = texture2D(u_clippingPolygonMeshPositions, vec2(meshIndices.y, 0.0)).xz;\n" +
    "            vec2 v2 = texture2D(u_clippingPolygonMeshPositions, vec2(meshIndices.z, 0.0)).xz;\n" +
    "\n" +
    "            // bail as soon as possible\n" +
    "            if (pointInTriangle(worldPos, v0, v1, v2)) {\n" +
    "                return true;\n" +
    "            }\n" +
    "\n" +
    "            i += 3.0;\n" +
    "        }\n" +
    "\n" +
    "        return false;\n" +
    "    }";

  var clippingPolygon =
    "" +
    "    void clippingPolygon(vec2 worldPos) {\n" +
    "        if (insideBox(worldPos, CLIPPING_POLYGON_BBOX_BTM_LEFT, CLIPPING_POLYGON_BBOX_TOP_RIGHT) < 1.0) {\n" +
    "            return;\n" +
    "        }\n" +
    "\n" +
    "        // convert the worldPos from cartesian to screen coordinates \n" +
    "        // to 2D cell coordinates to 1D cell coordinates\n" +
    "        float screenX = scale(worldPos.x, CLIPPING_POLYGON_BBOX_TOP_LEFT.x, CLIPPING_POLYGON_BBOX_TOP_RIGHT.x, 0.0, CLIPPING_POLYGON_BBOX_WIDTH);\n" +
    "        // NOTE: Y is intentionally inverted here, as -Z to Z should be flipped to match the table.\n" +
    "        float screenY = scale(worldPos.y, CLIPPING_POLYGON_BBOX_TOP_RIGHT.y, CLIPPING_POLYGON_BBOX_BTM_RIGHT.y, 0.0, CLIPPING_POLYGON_BBOX_HEIGHT);\n" +
    "        float row = floor(screenY / cellDimensions.y);\n" +
    "        float col = floor(screenX / cellDimensions.x);\n" +
    "\n" +
    "        float gridIndex = ((row * numRows) + col);\n" +
    "        float gridPixel = (gridIndex + 0.5) / u_clippingPolygonAccelerationGridNumPixels;\n" +
    "        vec3 gridCell = texture2D(u_clippingPolygonAccelerationGrid, vec2(gridPixel, 0.0)).xyz;\n" +
    "\n" +
    "        // cell is definitely NOT being occluded by a triangle\n" +
    "        // so render it as-is\n" +
    "        if (gridCell.r == CLIPPING_POLYGON_NO_OCCLUSION) {\n" +
    "            return;\n" +
    "        }\n" +
    "        \n" +
    "        // cell is definitely being completely occluded by at least\n" +
    "        // one triangle so discard it\n" +
    "        else if (gridCell.r == CLIPPING_POLYGON_TOTAL_OCCLUSION) {\n" +
    "            discard;\n" +
    "        }\n" +
    "\n" +
    "        // cell MIGHT be occluded by a triangle, check the relevant triangles\n" +
    "        // relevant to the current cell\n" +
    "        else if (isWorldPositionInsideAnyTriangle(worldPos, gridCell.g, gridCell.b)) {\n" +
    "            discard;\n" +
    "        }\n" +
    "\n" +
    "        // the point in triangle test failed, so render it as-is\n" +
    "    }";

  var clip2 = `
    float insideBox(vec2 v, vec2 bottomLeft, vec2 topRight) {
      vec2 s = step(bottomLeft, v) - step(topRight, v);
      return s.x * s.y;
    }

    void clippingPolygon(vec3 v_positionEC) {
      if (insideBox(v_positionEC.xy, CLIPPING_POLYGON_BBOX_BTM_LEFT, CLIPPING_POLYGON_BBOX_TOP_RIGHT) < 1.0) {
        discard;
      }
    }
  `;

  return "";
  //return "\nvoid clippingPolygon(vec3 dontCare) { discard; }\n";

  /*
  return "" +
    insideBoxFn +
    "\n" +
    pointInTriangle +
    "\n" +
    scaleFunction +
    "\n" +
    isWorldPositionInsideAnyTriangle +
    "\n" +
    clippingPolygon
  ;
   */
}

export default getClippingPolygonFunctions;
