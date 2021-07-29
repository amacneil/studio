// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PanelsState } from "@foxglove/studio-base/";
import ConsoleApi from "@foxglove/studio-base/services/ConsoleApi";
import {
  LayoutID,
  ISO8601Timestamp,
  ILayoutStorage,
  LayoutMetadata,
  Layout,
} from "@foxglove/studio-base/services/ILayoutStorage";

export default class ConsoleApiLayoutStorage implements ILayoutStorage {
  readonly supportsSharing = true;
  readonly supportsSyncing = false;

  constructor(private api: ConsoleApi) {}

  addLayoutsChangedListener(_listener: () => void): void {
    throw new Error("Method not implemented.");
  }

  removeLayoutsChangedListener(_listener: () => void): void {
    throw new Error("Method not implemented.");
  }

  async getLayouts(): Promise<LayoutMetadata[]> {
    return (await this.api.getLayouts({ includeData: false })) as LayoutMetadata[];
  }
  async getLayout(id: LayoutID): Promise<Layout | undefined> {
    return (await this.api.getLayout(id, { includeData: true })) as Layout | undefined;
  }

  async saveNewLayout({
    name,
    data,
  }: {
    name: string;
    data: PanelsState;
  }): Promise<LayoutMetadata> {
    return (await this.api.createLayout({
      name,
      data,
      permission: "creator_write",
    })) as LayoutMetadata;
  }

  async updateLayout({
    targetID,
    name,
    data,
    permission,
    ifUnmodifiedSince,
  }: {
    targetID: LayoutID;
    name?: string;
    data?: PanelsState;
    permission?: "creator_write" | "org_read" | "org_write";
    ifUnmodifiedSince: ISO8601Timestamp;
  }): Promise<void> {
    const existingLayout = await this.api.getLayout(targetID, { includeData: false });
    if (!existingLayout) {
      throw new Error("Layout not found");
    }
    if (existingLayout.updatedAt !== ifUnmodifiedSince) {
      throw new Error("Cloud and local layouts are different");
    }
    await this.api.updateLayout({
      id: targetID,
      name,
      data,
      permission,
    });
  }

  async deleteLayout({ id }: { id: LayoutID; ifUnmodifiedSince: ISO8601Timestamp }): Promise<void> {
    await this.api.deleteLayout(id);
  }
}
