import type { Container, Rectangle, Renderer, Texture } from 'pixi.js';

/**
 * Render a throwaway scene to a texture and let the scene go. The vector art is drawn once; what
 * stays on screen is a sprite.
 */
export function bake(
  renderer: Renderer,
  source: Container,
  frame: Rectangle,
  resolution: number,
): Texture {
  const texture = renderer.generateTexture({ target: source, frame, resolution, antialias: true });
  source.destroy({ children: true });
  return texture;
}
