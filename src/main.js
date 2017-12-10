import { makeRenderLoop, camera, cameraControls, gui, sandboxGUI, gl } from './init';
import ForwardRenderer from './renderers/forward';
import ClusteredForwardPlusRenderer from './renderers/clusteredForwardPlus';
import ClusteredDeferredRenderer from './renderers/clusteredDeferred';
import Scene from './scene';

const FORWARD = 'Forward';
const CLUSTERED_FORWARD_PLUS = 'Clustered Forward+';
const CLUSTERED_DEFFERED = 'Clustered Deferred';

const params = {
  renderer: CLUSTERED_DEFFERED,
  _renderer: null,
  SandboxMode: false,
  PointLight1: [ 0, 128, 255 ],
  PointLight1Intensity: 1,
  PointLight1Y: 0.0,
  PointLight1Z: 0.0,
};

setRenderer(params.renderer);

function setRenderer(renderer) {
  switch(renderer) {
    case FORWARD:
      params._renderer = new ForwardRenderer();
      break;
    case CLUSTERED_FORWARD_PLUS:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
    case CLUSTERED_DEFFERED:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
  }
}

gui.add(params, 'renderer', [FORWARD, CLUSTERED_FORWARD_PLUS, CLUSTERED_DEFFERED]).onChange(setRenderer);
gui.add(params, 'SandboxMode').onChange(setRenderer);
gui.add(params, 'PointLight1Y', 0.0, 10.0).onChange(setRenderer);
gui.add(params, 'PointLight1Z', -5.0, 5.0).onChange(setRenderer);
gui.addColor(params, 'PointLight1').onChange(setRenderer);
gui.add(params, 'PointLight1Intensity', 1, 30).onChange(setRenderer);

const scene = new Scene();
scene.loadGLTF('models/sponza/sponza.gltf');
// scene.loadGLTF('models/box/box.gltf');

camera.position.set(-10, 8, 0);
cameraControls.target.set(0, 2, 0);
gl.enable(gl.DEPTH_TEST);

function render() {
  scene.update();
  params._renderer.render(camera, scene, params.SandboxMode, params.PointLight1, params.PointLight1Intensity, params.PointLight1Y, params.PointLight1Z);
}

makeRenderLoop(render)();