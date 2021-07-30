// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { MutexLocked } from "@foxglove/den/async";
import { PanelsState } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";
import ConsoleApi from "@foxglove/studio-base/services/ConsoleApi";
import { Layout, LayoutID, ILayoutStorage } from "@foxglove/studio-base/services/ILayoutStorage";

/**
 * Provides a layout storage interface backed by a remote server, but with a local cache in between,
 * to provide offline access to layouts.
 *
 * The local cache is used first for all operations except layout sharing. A sync operation
 * determines what actions are needed to reconcile the cache with the remote storage, and performs
 * them or reports conflicts that it cannot resolve.
 *
 * By default we don't (currently) upload new layouts or changes made locally. The user triggers
 * these uploads with an explicit save action.
 *
 * This object does not handle any timeout logic and assumes that timeouts from remote storage will
 * be bubbled up as errors.
 */
export default class OfflineLayoutStorage implements ILayoutStorage {
  /**
   * All access to cache storage is wrapped in a mutex to prevent multi-step operations (such as
   * reading and then writing a single layout, or writing one and deleting another) from getting
   * interleaved.
   */
  private offlineStorage: MutexLocked<ILayoutStorage>;

  private remoteApi: ConsoleApi;

  readonly supportsSharing = true;
  readonly supportsReset = true;

  private changeListeners = new Set<() => void>();

  constructor({
    offlineStorage,
    consoleApi,
  }: {
    offlineStorage: ILayoutStorage;
    consoleApi: ConsoleApi;
  }) {
    this.offlineStorage = new MutexLocked(offlineStorage);
    this.remoteApi = consoleApi;
  }

  // fixme - connect to offlineStorage change listeners?
  addLayoutsChangedListener(listener: () => void): void {
    this.changeListeners.add(listener);
  }
  removeLayoutsChangedListener(listener: () => void): void {
    this.changeListeners.delete(listener);
  }
  private notifyChangeListeners() {
    queueMicrotask(() => {
      for (const listener of [...this.changeListeners]) {
        listener();
      }
    });
  }

  async getLayouts(): Promise<Layout[]> {
    return await this.offlineStorage.runExclusive(async (storage) => await storage.getLayouts());
  }

  async getLayout(id: LayoutID): Promise<Layout | undefined> {
    const layout = await this.offlineStorage.runExclusive(
      async (cache) => await cache.getLayout(id),
    );
    return layout;
  }

  async saveNewLayout(args: {
    name: string;
    data: PanelsState;
    permission: "creator_write" | "org_read" | "org_write";
  }): Promise<Layout> {
    try {
      return await this.offlineStorage.runExclusive(
        async (storage) => await storage.saveNewLayout(args),
      );
    } finally {
      this.notifyChangeListeners();
    }
  }

  async updateLayout(
    args: {
      id: LayoutID;
      name: string | undefined;
      data: PanelsState | undefined;
    },
    opt?: { reset: boolean },
  ): Promise<void> {
    try {
      // If the remote update fails we avoid persisting to local storage
      if (opt?.reset === true) {
        await this.remoteApi.updateLayout(args);
      }

      await this.offlineStorage.runExclusive(async (storage) => await storage.updateLayout(args));
    } finally {
      this.notifyChangeListeners();
    }
  }

  async deleteLayout(args: { id: LayoutID }): Promise<void> {
    try {
      return await this.offlineStorage.runExclusive(
        async (storage) => await storage.deleteLayout(args),
      );
    } finally {
      this.notifyChangeListeners();
    }
  }
}
