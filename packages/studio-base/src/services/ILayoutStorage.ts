// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PanelsState } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";

// We use "brand" tags to prevent confusion between string types with distinct meanings
// https://github.com/microsoft/TypeScript/issues/4895
export type UserID = string & { __brand: "UserID" };
export type LayoutID = string & { __brand: "LayoutID" };
export type ISO8601Timestamp = string & { __brand: "ISO8601Timestamp" };

/** Metadata that describes a panel layout. */
export type Layout = {
  id: LayoutID;
  name: string;
  creatorUserId: UserID | undefined;
  createdAt: ISO8601Timestamp | undefined;
  updatedAt: ISO8601Timestamp | undefined;
  permission: "creator_write" | "org_read" | "org_write";

  // fixme - this needs to be optional cause we don't always return data
  // also to support empty data as empty layout
  data: PanelsState;

  // fixme - should these be at another layer
  hasUnsyncedChanges?: boolean;
};

export interface ILayoutStorage {
  readonly supportsReset: boolean;
  readonly supportsSharing: boolean;

  addLayoutsChangedListener(listener: () => void): void;
  removeLayoutsChangedListener(listener: () => void): void;

  getLayouts(): Promise<Layout[]>;

  getLayout(id: LayoutID): Promise<Layout | undefined>;

  saveNewLayout(params: {
    name: string;
    data: PanelsState;
    permission: "creator_write" | "org_read" | "org_write";
  }): Promise<Layout>;

  /**
   * Update a layout that already exists
   *
   * An optional reset argument indicates the layout update should set the reset value for this layout.
   */
  updateLayout(
    params: {
      id: LayoutID;
      name?: string;
      data?: PanelsState;
      permission?: "creator_write" | "org_read" | "org_write";
    },
    opt?: { reset: boolean },
  ): Promise<void>;

  deleteLayout(params: { id: LayoutID }): Promise<void>;
}
