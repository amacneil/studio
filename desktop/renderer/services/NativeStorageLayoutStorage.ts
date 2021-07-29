// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { v4 as uuidv4 } from "uuid";

import Log from "@foxglove/log";
import {
  ILayoutStorage,
  ISO8601Timestamp,
  Layout,
  LayoutID,
  PanelsState,
  UserID,
} from "@foxglove/studio-base";

import { Storage } from "../../common/types";

const log = Log.getLogger(__filename);

// an on-disk layout record
type LayoutRecord = {
  id: LayoutID;
  name: string;
  state: PanelsState | undefined;

  creatorUserId?: UserID | undefined;
  createdAt?: ISO8601Timestamp | undefined;
  updatedAt?: ISO8601Timestamp | undefined;
  permission?: "creator_write" | "org_read" | "org_write";
};

// fixme - remove
const emptyLayout: Omit<PanelsState, "name" | "id"> = {
  configById: {},
  globalVariables: {},
  userNodes: {},
  linkedGlobalVariables: [],
  playbackConfig: {
    speed: 1.0,
    messageOrder: "receiveTime",
    timeDisplayMethod: "ROS",
  },
};

function assertLayout(value: unknown): asserts value is LayoutRecord {
  if (typeof value !== "object" || value == undefined) {
    throw new Error("Invariant violation - layout item is not an object");
  }

  if (!("id" in value)) {
    throw new Error("Invariant violation - layout item is missing an id");
  }
}

function layoutRecordToLayout(record: LayoutRecord): Layout {
  return {
    id: record.id,
    name: record.name,
    // fixme - should support undefined so we don't use empty object for empty panel state
    data: record.state ?? emptyLayout,
    creatorUserId: record.creatorUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    permission: record.permission ?? "creator_write",
  };
}

function layoutToLayoutRecord(layout: Layout): LayoutRecord {
  const { data: state, ...rest } = layout;
  return {
    ...rest,
    state,
  };
}

// Implement a LayoutStorage interface over OsContext
export default class NativeStorageLayoutStorage implements ILayoutStorage {
  readonly supportsSharing = false;
  readonly supportsSyncing = false;

  private static STORE_NAME = "layouts";

  private _ctx: Storage;

  private changeListeners = new Set<() => void>();

  constructor(storage: Storage) {
    this._ctx = storage;
  }

  addLayoutsChangedListener(listener: () => void): void {
    this.changeListeners.add(listener);
  }

  removeLayoutsChangedListener(listener: () => void): void {
    this.changeListeners.delete(listener);
  }

  // fixme - catch throws from listeners? how to surface?
  private notifyChangeListeners() {
    queueMicrotask(() => {
      for (const listener of [...this.changeListeners]) {
        listener();
      }
    });
  }

  async getLayouts(): Promise<Layout[]> {
    const items = await this._ctx.all(NativeStorageLayoutStorage.STORE_NAME);

    const layouts: LayoutRecord[] = [];
    for (const item of items) {
      if (!(item instanceof Uint8Array)) {
        throw new Error("Invariant violation - layout item is not a buffer");
      }

      try {
        const str = new TextDecoder().decode(item);
        const parsed = JSON.parse(str);
        assertLayout(parsed);
        layouts.push(parsed);
      } catch (err) {
        log.error(err);
      }
    }

    return layouts.map(layoutRecordToLayout);
  }

  async getLayout(id: LayoutID): Promise<Layout | undefined> {
    const item = await this._ctx.get(NativeStorageLayoutStorage.STORE_NAME, id);
    if (item == undefined) {
      return undefined;
    }
    if (!(item instanceof Uint8Array)) {
      throw new Error("Invariant violation - layout item is not a buffer");
    }

    const str = new TextDecoder().decode(item);
    const parsed = JSON.parse(str);
    assertLayout(parsed);
    return layoutRecordToLayout(parsed);
  }

  async saveNewLayout(layout: Partial<Layout>): Promise<Layout> {
    if (layout.name == undefined || layout.name.length === 0) {
      throw new Error("Layout name is required");
    }

    const fullLayout: Layout = {
      id: layout.id ?? (uuidv4() as LayoutID),
      name: layout.name,
      createdAt: new Date().toISOString() as ISO8601Timestamp,
      updatedAt: new Date().toISOString() as ISO8601Timestamp,
      creatorUserId: "local" as UserID,
      permission: "creator_write",
      // fixme - rather than empty object here we need to allow for undefined panel state
      // and lower levels will setup the default empty panel state
      data: layout.data ?? emptyLayout,
    };

    await this.updateLayout(fullLayout);
    try {
      return fullLayout;
    } finally {
      this.notifyChangeListeners();
    }
  }

  async updateLayout(layout: Layout): Promise<void> {
    const existing = await this.getLayout(layout.id);

    const mergedLayout = {
      ...existing,
      ...layout,
    };

    mergedLayout.updatedAt = new Date().toISOString() as ISO8601Timestamp;
    const content = JSON.stringify(layoutToLayoutRecord(mergedLayout));
    try {
      return await this._ctx.put(NativeStorageLayoutStorage.STORE_NAME, layout.id, content);
    } finally {
      this.notifyChangeListeners();
    }
  }

  async deleteLayout(params: { id: LayoutID }): Promise<void> {
    try {
      return await this._ctx.delete(NativeStorageLayoutStorage.STORE_NAME, params.id);
    } finally {
      this.notifyChangeListeners();
    }
  }
}
