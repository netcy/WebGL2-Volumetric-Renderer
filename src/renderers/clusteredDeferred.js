import { gl, canvas } from '../init';
import { mat4, vec4, vec3, quat} from 'gl-matrix';
import { loadShaderProgram, renderFullscreenQuad } from '../utils';
import { NUM_LIGHTS } from '../scene';
import { MAX_LIGHTS_PER_CLUSTER } from './clustered';
import toTextureVert from '../shaders/deferredToTexture.vert.glsl';
import toTextureFrag from '../shaders/deferredToTexture.frag.glsl';
import QuadVertSource from '../shaders/quad.vert.glsl';
import fsSource from '../shaders/deferred.frag.glsl.js';
import TextureBuffer from './textureBuffer';
import ClusteredRenderer from './clustered';

export const NUM_GBUFFERS = 3;

export default class ClusteredDeferredRenderer extends ClusteredRenderer {
  constructor(xSlices, ySlices, zSlices) {
    super(xSlices, ySlices, zSlices);
    
    this.setupDrawBuffers(canvas.width, canvas.height);
    
    // Create a texture to store light data
    this._lightTexture = new TextureBuffer(NUM_LIGHTS, 8);

    // Create a 3D texture to store volume
    this.createVolumeBuffer();

    this._progCopy = loadShaderProgram(toTextureVert, toTextureFrag, {
      uniforms: ['u_viewProjectionMatrix', 'u_colmap', 'u_normap', 'u_viewMatrix'],
      attribs: ['a_position', 'a_normal', 'a_uv']
    });
    
    // this._progVol = loadShaderProgram(VolVert, VolFrag, {
    //   uniforms: [],
    //   attribs: []
    // });

    this._progShade = loadShaderProgram(QuadVertSource, fsSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: ['u_gbuffers[0]', 'u_gbuffers[1]', 'u_gbuffers[2]', 'u_lightbuffer', 'u_clusterbuffer', 'u_viewMatrix', 'u_screenW', 'u_screenH', 'u_camN', 'u_camF', 'u_camPos',
        'u_volBuffer', 'u_time', 'u_volSize', 'u_volTransMat' /*'u_volPos', 'u_volOrient'*/],
      attribs: ['a_uv']
    });

    this._projectionMatrix = mat4.create();
    this._viewMatrix = mat4.create();
    this._viewProjectionMatrix = mat4.create();
  }

  setupDrawBuffers(width, height) {
    this._width = width;
    this._height = height;

    this._fbo = gl.createFramebuffer();
    
    //Create, bind, and store a depth target texture for the FBO
    this._depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._depthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16/*gl.DEPTH_COMPONENT*/, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._depthTex, 0);

    // Create, bind, and store "color" target textures for the FBO
    this._gbuffers = new Array(NUM_GBUFFERS);
    //let attachments = new Array(NUM_GBUFFERS);

    this._gbuffers[0] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._gbuffers[0], 0);

    this._gbuffers[1] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this._gbuffers[1], 0);

    this._gbuffers[2] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this._gbuffers[2], 0);


    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }

    // Tell the WEBGL_draw_buffers extension which FBO attachments are
    // being used. (This extension allows for multiple render targets.)
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
      gl.COLOR_ATTACHMENT2
    ]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  createVolumeBuffer() {
    // CREATE AND BING THE 3D-TEXTURE
    // reference: http://www.realtimerendering.com/blog/webgl-2-new-features/
    this.SIZE = 128;
    var max = this.SIZE + this.SIZE*this.SIZE + this.SIZE*this.SIZE*this.SIZE;
    this.data = new Uint8Array(this.SIZE * this.SIZE * this.SIZE);
    for (var k = 0; k < this.SIZE; ++k) {
      for (var j = 0; j < this.SIZE; ++j) {
        for (var i = 0; i < this.SIZE; ++i) {
          this.data[i + j * this.SIZE + k * this.SIZE * this.SIZE] = Math.random() * 255.0;//(i + j * this.SIZE + k * this.SIZE * this.SIZE) / max * 255.0;//Math.random() * 255.0; // snoise([i, j, k]) * 256;
        }
      }
    }

    var volPos = vec3.fromValues(0, 0, 0); // position of the volume
    var volScale = vec3.fromValues(1, 1, 1); // scale of the volume
    var volOrient = quat.create(); // [0, 45 * Math.PI/180, 0];
    quat.fromEuler(volOrient, 0, 45 * Math.PI/180, 0);

    this.volTransMat = mat4.create();
    mat4.fromRotationTranslationScale(this.volTransMat, volOrient, volPos, volScale);

    this._volBuffer = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, Math.log2(this.SIZE));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(
      gl.TEXTURE_3D,  // target
      0,              // level
      gl.R8,        // internalformat
      this.SIZE,           // width
      this.SIZE,           // height
      this.SIZE,           // depth
      0,              // border
      gl.RED,         // format
      gl.UNSIGNED_BYTE,       // type
      this.data            // pixel
    );
    gl.generateMipmap(gl.TEXTURE_3D);
    gl.bindTexture(gl.TEXTURE_3D, null);
    // gl.uniform1i(this._shaderProgram.u_volBuffer, 0);
    // END: CREATE 3D-TEXTURE
  }

  resize(width, height) {
    this._width = width;
    this._height = height;

    gl.bindTexture(gl.TEXTURE_2D, this._depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    
    for (let i = 0; i < NUM_GBUFFERS; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(camera, scene) {
    if (canvas.width != this._width || canvas.height != this._height) {
      this.resize(canvas.width, canvas.height);
    }

    // Update the camera matrices
    camera.updateMatrixWorld();
    mat4.invert(this._viewMatrix, camera.matrixWorld.elements);
    mat4.copy(this._projectionMatrix, camera.projectionMatrix.elements);
    mat4.multiply(this._viewProjectionMatrix, this._projectionMatrix, this._viewMatrix);

    // Render to the whole screen
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Bind the framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);

    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Use the shader program to copy to the draw buffers
    gl.useProgram(this._progCopy.glShaderProgram);

    // Upload the camera matrix
    gl.uniformMatrix4fv(this._progCopy.u_viewProjectionMatrix, false, this._viewProjectionMatrix);

    // view matrix
    gl.uniformMatrix4fv(this._progCopy.u_viewMatrix, false, this._viewMatrix);

    // Draw the scene. This function takes the shader program so that the model's textures can be bound to the right inputs
    scene.draw(this._progCopy);


    // create the volume texture..

    // Update the buffer used to populate the texture packed with light data
    for (let i = 0; i < NUM_LIGHTS; ++i) {
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 0] = scene.lights[i].position[0];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 1] = scene.lights[i].position[1];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 2] = scene.lights[i].position[2];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 3] = scene.lights[i].radius;

      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 0] = scene.lights[i].color[0];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 1] = scene.lights[i].color[1];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 2] = scene.lights[i].color[2];
    }
    // Update the light texture
    this._lightTexture.update();

    // Update the clusters for the frame
    this.updateClustersOptimized(camera, this._viewMatrix, scene);

    // Bind the default null framebuffer which is the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Use this shader program
    gl.useProgram(this._progShade.glShaderProgram);

    // TODO: Bind any other shader inputs
    gl.uniformMatrix4fv(this._progShade.u_viewMatrix, false, this._viewMatrix);
    gl.uniform1f(this._progShade.u_screenW, canvas.width);
    gl.uniform1f(this._progShade.u_screenH, canvas.height);
    gl.uniform1f(this._progShade.u_camN, camera.near);
    gl.uniform1f(this._progShade.u_camF, camera.far);
    gl.uniform3f(this._progShade.u_camPos, camera.position.x, camera.position.y, camera.position.z);
    
    gl.uniform1f(this._progShade.u_volSize, this.SIZE);
    // gl.uniform3f(this._progShade.u_volPos, this.volPos[0], this.volPos[1], this.volPos[2]);
    gl.uniformMatrix4fv(this._progShade.u_volTransMat, false, this.volTransMat);

    if(this.framenum === undefined) this.framenum = 0.0;
    this.framenum+=0.05;
    gl.uniform1f(this._progShade.u_time, this.framenum);
    // if(this.t0 === undefined) {
    //   this.t0 = performance.now();
    //   gl.uniform1f(this._progShade.u_time, 0);
    // }
    // else {
    //   t1 = performance.now();
    //   gl.uniform1f(this._progShade.u_time, t1 - t0);
    // }
    // this.t0 = this.t1;


    // Bind g-buffers
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
    gl.uniform1i(this._progShade[`u_gbuffers[0]`], 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
    gl.uniform1i(this._progShade[`u_gbuffers[1]`], 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
    gl.uniform1i(this._progShade[`u_gbuffers[2]`], 2);

    // Bind the light and cluster textures...
    // Set the light texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
    gl.uniform1i(this._progShade.u_lightbuffer, 3);

    // Set the cluster texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
    gl.uniform1i(this._progShade.u_clusterbuffer, 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.uniform1i(this._progShade.u_volBuffer, 5);

    renderFullscreenQuad(this._progShade);
  }
};