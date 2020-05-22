import PolygonClippingAccelerationGrid from "./PolygonClippingAccelerationGrid.js";
import defaultValue from "../Core/defaultValue.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Cartesian2 from "../Core/Cartesian2.js";
import PolygonPipeline from "../Core/PolygonPipeline.js";
import WindingOrder from "../Core/WindingOrder.js";
import earcut from "../ThirdParty/earcut-2.2.1.js";
import DeveloperError from "../Core/DeveloperError.js";
import Texture from "../Renderer/Texture.js";
import PixelDatatype from "../Renderer/PixelDatatype.js";
import Sampler from "../Renderer/Sampler.js";
import TextureMagnificationFilter from "../Renderer/TextureMagnificationFilter.js";
import TextureMinificationFilter from "../Renderer/TextureMinificationFilter.js";
import TextureWrap from "../Renderer/TextureWrap.js";
import PixelFormat from "../Core/PixelFormat.js";

/**
 * Constructs a clipping mesh used to selectively enable / disable rendering
 * inside of the region defined by the clipping mesh.
 *
 * @param {Object} options Object with the following properties:
 * @param {Array.<PolygonHierarchy>} options.polygonHierarchies A list of Polygon
 * Hierarchies to amalgamate into a single clipping mesh. Holes are supported.
 * @param {Number} [options.simplify-0] Tolerance threshold that should be used
 * for mesh simplification.
 * @param {Boolean} [options.union-false] If union is TRUE only geometry inside
 * the ClippingPolygon will be rendered. Otherwise only geometry outside the
 * ClippingPolygon will be rendered.
 */

function ClippingPolygon(options) {
  var polygonHierarchies = options.polygonHierarchies;
  var simplifyTolerance = defaultValue(options.simplify, 0);
  var union = defaultValue(options.union, false);

  // TODO: Add optional simplification parameter here.
  var amalgamatedMesh = combinePolygonHierarchiesIntoSingleMesh(
    polygonHierarchies
  );

  var accelerator = new PolygonClippingAccelerationGrid({
    positions: amalgamatedMesh.positions,
    indices: amalgamatedMesh.indices,
    numComponents: 2,
    splits: 127,
    xIndex: 0,
    yIndex: 1,
  });

  this._accelerator = accelerator;
  this._grid = accelerator.grid;
  this._overlappingTriangleIndices = accelerator.overlappingTriangleIndices;
  this._meshPositions = Float32Array.from(amalgamatedMesh.positions);
  this._dirty = true;

  this._gridTexture = undefined;
  this._meshPositionTexture = undefined;
  this._overlappingTriangleIndicesTexture = undefined;

  var boundingBox = this._accelerator.boundingBox;
  this._boundingBox = boundingBox.toClockwiseCartesian2Pairs();
  this._cellDimensions = new Cartesian2(
    this._accelerator.cellWidth,
    this._accelerator.cellHeight
  );

  this._numRowsAndCols = new Cartesian2(
    this._accelerator.numRows,
    this._accelerator.numCols
  );

  console.log(this._grid);
}

Object.defineProperties(ClippingPolygon.prototype, {
  grid: {
    get: function () {
      return this._grid;
    },
  },

  gridNumPixels: {
    get: function () {
      return this._grid.length / this._accelerator.cellNumElements;
    },
  },

  gridTexture: {
    get: function () {
      return this._gridTexture;
    },
  },

  meshPositions: {
    get: function () {
      return this._meshPositions;
    },
  },

  meshPositionsNumPixels: {
    get: function () {
      return this._meshPositions / 3.0; // Assuming XYZ, XYZ, XYZ, …
    },
  },

  meshPositionsTexture: {
    get: function () {
      return this._meshPositionTexture;
    },
  },

  overlappingTriangleIndices: {
    get: function () {
      return this._overlappingTriangleIndices;
    },
  },

  overlappingTriangleIndicesNumPixels: {
    get: function () {
      return this._overlappingTriangleIndices / 3.0;
    },
  },

  overlappingTriangleIndicesTexture: {
    get: function () {
      return this._overlappingTriangleIndicesTexture;
    },
  },

  boundingBox: {
    get: function () {
      return this._boundingBox;
    },
  },

  cellDimensions: {
    get: function () {
      return this._cellDimensions;
    },
  },

  numRowsAndCols: {
    get: function () {
      return this._numRowsAndCols;
    },
  },
});

ClippingPolygon.setOwner = function (clippingPolygon, owner, key) {
  // TODO: What does   if (clippingPlaneCollection === owner[key]) { mean
};

ClippingPolygon.prototype.update = function (frameState) {
  if (!this._dirty) {
    return;
  }

  this._dirty = false;
  var context = frameState.context;

  if (!context.floatingPointTexture) {
    // TODO: Implement the bitpacking version + multidimensional texture
    //       to overcome the 4096x1 texture limit
    throw new DeveloperError("OES_texture_float or WebGL2 required");
  }

  this._gridTexture = new Texture({
    context: context,
    width: this.gridNumPixels,
    height: 1,
    pixelFormat: PixelFormat.RGB,
    pixelDatatype: PixelDatatype.FLOAT,
    sampler: Sampler.NEAREST,
    wrapS: TextureWrap.CLAMP_TO_EDGE,
    wrapT: TextureWrap.CLAMP_TO_EDGE,
    minificationFilter: TextureMinificationFilter.NEAREST,
    magnificationFilter: TextureMagnificationFilter.NEAREST,
  });

  this._gridTexture.copyFrom({
    width: this.gridNumPixels,
    height: 1,
    arrayBufferView: this.grid,
  });

  this._meshPositionTexture = new Texture({
    context: context,
    width: this.meshPositionsNumPixels,
    height: 1,
    pixelFormat: PixelFormat.RGB,
    pixelDatatype: PixelDatatype.FLOAT,
    sampler: Sampler.NEAREST,
    wrapS: TextureWrap.CLAMP_TO_EDGE,
    wrapT: TextureWrap.CLAMP_TO_EDGE,
    minificationFilter: TextureMinificationFilter.NEAREST,
    magnificationFilter: TextureMagnificationFilter.NEAREST,
  });

  this._meshPositionTexture.copyFrom({
    width: this.meshPositionsNumPixels,
    height: 1,
    arrayBufferView: this.meshPositions,
  });

  this._overlappingTriangleIndicesTexture = new Texture({
    context: context,
    width: this.overlappingTriangleIndicesNumPixels,
    height: 1,
    pixelFormat: PixelFormat.RGB,
    pixelDatatype: PixelDatatype.FLOAT,
    sampler: Sampler.NEAREST,
    wrapS: TextureWrap.CLAMP_TO_EDGE,
    wrapT: TextureWrap.CLAMP_TO_EDGE,
    minificationFilter: TextureMinificationFilter.NEAREST,
    magnificationFilter: TextureMagnificationFilter.NEAREST,
  });

  this._overlappingTriangleIndicesTexture.copyFrom({
    width: this.overlappingTriangleIndicesNumPixels,
    height: 1,
    arrayBufferView: this.overlappingTriangleIndices,
  });
};

/**
 * @param {Array.<PolygonHierarchy>} hierarchies
 * @return {Object} An object containing the vertex positions plus indices
 */

function combinePolygonHierarchiesIntoSingleMesh(hierarchies) {
  var amalgamatedPositions1D = [];
  var amalgamatedHoles2D = [];
  var hole;

  var i, j, k;
  for (i = 0; i < hierarchies.length; ++i) {
    var hierarchy = hierarchies[i];
    var values = hierarchy.getValue();
    var positions = values.positions;
    var holes = values.holes;

    for (j = 0; j < positions.length; ++j) {
      var p = Cartesian3.clone(positions[j]);
      p.z = 0;
      amalgamatedPositions1D.push(p);
    }

    for (j = 0; j < holes.length; ++j) {
      hole = holes[j];
      var clonedHoles = [];
      for (k = 0; k < hole.positions.length; ++k) {
        var h = Cartesian3.clone(hole.positions[k]);
        h.z = 0;
        clonedHoles.push(h);
      }

      amalgamatedHoles2D.push(clonedHoles);
    }
  }

  var posWinding = PolygonPipeline.computeWindingOrder2D(
    amalgamatedPositions1D
  );
  if (posWinding === WindingOrder.CLOCKWISE) {
    amalgamatedPositions1D.reverse();
  }

  var holeWinding = PolygonPipeline.computeWindingOrder2D(
    amalgamatedPositions1D
  );
  if (holeWinding === WindingOrder.CLOCKWISE) {
    amalgamatedHoles2D.reverse();
  }

  var flattenedPositions = Cartesian2.packArray(amalgamatedPositions1D);

  var holeIndices = [];
  for (i = 0; i < amalgamatedHoles2D.length; i++) {
    {
      var flatHole = Cartesian2.packArray(amalgamatedHoles2D[i]);
      holeIndices.push(flattenedPositions.length / 2.0);
      flattenedPositions = flattenedPositions.concat(flatHole);
    }
  }

  var indices = earcut(flattenedPositions, holeIndices, 2);
  return {
    positions: flattenedPositions,
    indices: indices,
  };
}

export default ClippingPolygon;
