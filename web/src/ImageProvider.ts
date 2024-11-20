import {ImageEntry} from "./schema.ts";

export class LoadedEntry {
  constructor(public entry: ImageEntry, public thumbnail: HTMLImageElement) {
  }

  get id(): string {
    return imageEntryID(this.entry);
  }

  get aspectRatio(): number {
    return this.thumbnail.width / this.thumbnail.height;
  }
}

export class ImageProvider {
  private _loading = new Set<string>();
  private _entries = new Map<string, LoadedEntry>();

  add(entry: ImageEntry) {
    const id = imageEntryID(entry);

    if (this._loading.has(id)) return;

    this._loading.add(id);

    const thumbnail = new Image();
    thumbnail.src = `https://cdn.bsky.app/img/feed_thumbnail/plain/${entry.event.did}/${entry.image.image.ref.$link}@jpeg`;
    thumbnail.addEventListener('load', () => {
      this._loading.delete(id);
      this._entries.set(id, new LoadedEntry(entry, thumbnail));
    });
  }

  remove(url: string) {
    this._loading.delete(url);
    this._entries.delete(url);
  }

  * [Symbol.iterator](): IterableIterator<LoadedEntry> {
    yield* this._entries.values();
  }
}

function imageEntryID(entry: ImageEntry): string {
  return `${entry.event.did}/${entry.event.commit.rkey}/${entry.event.commit.rev}/${entry.image.image.ref.$link}`;
}
