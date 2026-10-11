import { expect, it, vi } from "vitest";
import { blockMenuMusic, createMenuMusicPlayer, menuMusicBlocked } from "./menu-music";

it("waits for interaction, loops across menus, respects volume and pauses outside menus", async () => {
  const audio = {src:"",loop:false,preload:"",paused:true,volume:1,muted:false,
    play:vi.fn(async()=>{audio.paused=false;}),pause:vi.fn(()=>{audio.paused=true;}),removeAttribute:vi.fn(),load:vi.fn()};
  const player = createMenuMusicPlayer(audio as unknown as HTMLAudioElement);
  const settings = {muted:false,effects:0.7,music:0.35};
  player.update(true,settings,true);
  expect(audio.play).not.toHaveBeenCalled();
  player.unlock();await Promise.resolve();
  expect(audio.loop).toBe(true);expect(audio.volume).toBe(0.35);
  player.update(true,settings,true);expect(audio.play).toHaveBeenCalledTimes(1);
  player.update(false,settings,true);expect(audio.paused).toBe(true);
  player.update(true,settings,true);await Promise.resolve();expect(audio.paused).toBe(false);
  player.update(true,{...settings,muted:true},true);expect(audio.paused).toBe(true);
  player.update(true,settings,false);expect(audio.paused).toBe(true);
  player.dispose();expect(audio.removeAttribute).toHaveBeenCalledWith("src");
});

it("keeps music blocked until all combat arenas have unmounted", () => {
  const first = blockMenuMusic();const second = blockMenuMusic();
  expect(menuMusicBlocked()).toBe(true);first();expect(menuMusicBlocked()).toBe(true);
  second();expect(menuMusicBlocked()).toBe(false);
});
