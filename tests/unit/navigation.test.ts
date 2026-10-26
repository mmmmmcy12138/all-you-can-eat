import { describe, it, expect } from 'vitest';
import { navigation, isActivePath } from '../../lib/navigation';
import manifest from '../../app/manifest';
describe('navigation', () => {
 it('has five distinct destinations', () => {expect(new Set(navigation.map(n=>n.href)).size).toBe(5);});
 it('only activates home on root', () => {expect(isActivePath('/', '/')).toBe(true);expect(isActivePath('/fridge', '/')).toBe(false);});
 it('matches nested pages without matching unrelated prefixes', () => {expect(isActivePath('/menu/recipes', '/menu')).toBe(true);expect(isActivePath('/menus', '/menu')).toBe(false);});
});
describe('app metadata', () => {it('declares AYCE identity and same-origin install scope', () => {expect(manifest()).toMatchObject({name:'All You Can Eat',short_name:'AYCE',start_url:'/',scope:'/',display:'standalone'});});});
