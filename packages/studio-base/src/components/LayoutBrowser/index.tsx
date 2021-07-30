// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { DefaultButton, IconButton, Spinner, Stack, useTheme } from "@fluentui/react";
import { partition } from "lodash";
import moment from "moment";
import path from "path";
import { useCallback, useContext, useEffect } from "react";
import { useToasts } from "react-toast-notifications";
import { useMountedState } from "react-use";
import useAsyncFn from "react-use/lib/useAsyncFn";

import { SidebarContent } from "@foxglove/studio-base/components/SidebarContent";
import { useTooltip } from "@foxglove/studio-base/components/Tooltip";
import { useAnalytics } from "@foxglove/studio-base/context/AnalyticsContext";
import {
  useCurrentLayoutActions,
  useCurrentLayoutSelector,
} from "@foxglove/studio-base/context/CurrentLayoutContext";
import { PanelsState } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";
import { useLayoutStorage } from "@foxglove/studio-base/context/LayoutStorageContext";
import LayoutStorageDebuggingContext from "@foxglove/studio-base/context/LayoutStorageDebuggingContext";
import welcomeLayout from "@foxglove/studio-base/layouts/welcomeLayout";
import { defaultPlaybackConfig } from "@foxglove/studio-base/providers/CurrentLayoutProvider/reducers";
import { AppEvent } from "@foxglove/studio-base/services/IAnalytics";
import { Layout } from "@foxglove/studio-base/services/ILayoutStorage";
import { downloadTextFile } from "@foxglove/studio-base/util/download";

import LayoutSection from "./LayoutSection";
import showOpenFilePicker from "./showOpenFilePicker";
import { debugBorder } from "./styles";

export default function LayoutBrowser({
  currentDateForStorybook,
}: React.PropsWithChildren<{
  currentDateForStorybook?: Date;
}>): JSX.Element {
  const theme = useTheme();
  const isMounted = useMountedState();
  const { addToast } = useToasts();
  const layoutStorage = useLayoutStorage();

  const currentLayoutId = useCurrentLayoutSelector((state) => state.selectedLayout?.id);
  const { setSelectedLayout } = useCurrentLayoutActions();

  const [layouts, reloadLayouts] = useAsyncFn(
    async () => {
      const [personal, shared] = partition(
        await layoutStorage.getLayouts(),
        layoutStorage.supportsSharing
          ? (layout) => layout.permission === "creator_write"
          : () => true,
      );
      return { personal, shared };
    },
    [layoutStorage],
    { loading: true },
  );

  useEffect(() => {
    const listener = () => void reloadLayouts();
    layoutStorage.addLayoutsChangedListener(listener);
    return () => layoutStorage.removeLayoutsChangedListener(listener);
  }, [layoutStorage, reloadLayouts]);

  // Start loading on first mount
  useEffect(() => {
    void reloadLayouts();
  }, [reloadLayouts]);

  const onSelectLayout = useCallback(
    async (item: Pick<Layout, "id">) => {
      const layout = await layoutStorage.getLayout(item.id);
      if (layout) {
        setSelectedLayout(layout);
      }
    },
    [layoutStorage, setSelectedLayout],
  );

  const onSaveLayout = useCallback(
    async (layout: Layout) => {
      await layoutStorage.updateLayout(layout, { reset: true });
    },
    [layoutStorage],
  );

  const onRenameLayout = useCallback(
    async (item: Layout, newName: string) => {
      await layoutStorage.updateLayout({ id: item.id, name: newName });
      if (currentLayoutId === item.id) {
        await onSelectLayout(item);
      }
    },
    [currentLayoutId, layoutStorage, onSelectLayout],
  );

  const onDuplicateLayout = useCallback(
    async (item: Layout) => {
      const source = await layoutStorage.getLayout(item.id);
      if (source) {
        const newLayout = await layoutStorage.saveNewLayout({
          name: `${item.name} copy`,
          data: source.data,
          permission: "creator_write",
        });
        await onSelectLayout(newLayout);
      }
    },
    [layoutStorage, onSelectLayout],
  );

  const onDeleteLayout = useCallback(
    async (item: Layout) => {
      await layoutStorage.deleteLayout({ id: item.id });
      if (currentLayoutId !== item.id) {
        return;
      }
      // If the layout was selected, select a different available layout
      for (const { id } of await layoutStorage.getLayouts()) {
        const layout = await layoutStorage.getLayout(id);
        if (layout) {
          setSelectedLayout(layout);
          return;
        }
      }
      // If no existing layout could be selected, use the welcome layout
      const newLayout = await layoutStorage.saveNewLayout({
        name: welcomeLayout.name,
        data: welcomeLayout.data,
        permission: "creator_write",
      });
      await onSelectLayout(newLayout);
    },
    [currentLayoutId, layoutStorage, setSelectedLayout, onSelectLayout],
  );

  const analytics = useAnalytics();

  const createNewLayout = useCallback(async () => {
    const name = `Unnamed layout ${moment(currentDateForStorybook).format("l")} at ${moment(
      currentDateForStorybook,
    ).format("LT")}`;
    const state: Omit<PanelsState, "name" | "id"> = {
      configById: {},
      globalVariables: {},
      userNodes: {},
      linkedGlobalVariables: [],
      playbackConfig: defaultPlaybackConfig,
    };
    const newLayout = await layoutStorage.saveNewLayout({
      name,
      data: state as PanelsState,
      permission: "creator_write",
    });
    void onSelectLayout(newLayout);

    void analytics.logEvent(AppEvent.LAYOUT_CREATE);
  }, [currentDateForStorybook, layoutStorage, analytics, onSelectLayout]);

  const onExportLayout = useCallback(
    async (item: Layout) => {
      const layout = await layoutStorage.getLayout(item.id);
      if (layout) {
        const content = JSON.stringify(layout.data, undefined, 2);
        downloadTextFile(content, `${item.name}.json`);
        void analytics.logEvent(AppEvent.LAYOUT_EXPORT);
      }
    },
    [layoutStorage, analytics],
  );

  const onShareLayout = useCallback(
    async (layout: Layout) => {
      layout.permission = "org_write";
      await layoutStorage.updateLayout(layout);

      // fixme - how do we make sure this is sent to the server?
      // can layout storage provide an optional sync function?
      // can the update functions accept an arg?
    },
    [layoutStorage],
  );

  const importLayout = useCallback(async () => {
    const [fileHandle] = await showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: "JSON Files",
          accept: {
            "application/json": [".json"],
          },
        },
      ],
    });
    if (!fileHandle) {
      return;
    }

    const file = await fileHandle.getFile();
    const layoutName = path.basename(file.name, path.extname(file.name));
    const content = await file.text();
    const parsedState: unknown = JSON.parse(content);

    if (!isMounted()) {
      return;
    }

    if (typeof parsedState !== "object" || !parsedState) {
      addToast(`${file.name} is not a valid layout`, { appearance: "error" });
      return;
    }

    const data = parsedState as PanelsState;
    const newLayout = await layoutStorage.saveNewLayout({
      name: layoutName,
      data,
      permission: "creator_write",
    });
    void onSelectLayout(newLayout);

    void analytics.logEvent(AppEvent.LAYOUT_IMPORT);
  }, [addToast, isMounted, layoutStorage, analytics, onSelectLayout]);

  const createLayoutTooltip = useTooltip({ contents: "Create new layout" });
  const importLayoutTooltip = useTooltip({ contents: "Import layout" });

  const layoutDebug = useContext(LayoutStorageDebuggingContext);

  return (
    <SidebarContent
      title="Layouts"
      noPadding
      trailingItems={[
        layouts.loading && <Spinner />,
        // eslint-disable-next-line react/jsx-key
        <IconButton
          elementRef={createLayoutTooltip.ref}
          iconProps={{ iconName: "Add" }}
          onClick={createNewLayout}
          ariaLabel="Create new layout"
          data-test="add-layout"
        >
          {createLayoutTooltip.tooltip}
        </IconButton>,
        // eslint-disable-next-line react/jsx-key
        <IconButton
          elementRef={importLayoutTooltip.ref}
          iconProps={{ iconName: "OpenFile" }}
          onClick={importLayout}
          ariaLabel="Import layout"
        >
          {importLayoutTooltip.tooltip}
        </IconButton>,
      ]}
    >
      <Stack verticalFill>
        <Stack.Item>
          <LayoutSection
            title={layoutStorage.supportsSharing ? "Personal" : undefined}
            emptyText="Add a new layout to get started with Foxglove Studio!"
            items={layouts.value?.personal}
            selectedId={currentLayoutId}
            onSelect={onSelectLayout}
            onSave={onSaveLayout}
            onRename={onRenameLayout}
            onDuplicate={onDuplicateLayout}
            onDelete={onDeleteLayout}
            onShare={onShareLayout}
            onExport={onExportLayout}
          />
        </Stack.Item>
        <Stack.Item>
          {layoutStorage.supportsSharing && (
            <LayoutSection
              title="Shared"
              emptyText="Your organization doesn’t have any shared layouts yet. Share a personal layout to collaborate with other team members."
              items={layouts.value?.shared}
              selectedId={currentLayoutId}
              onSelect={onSelectLayout}
              onSave={onSaveLayout}
              onRename={onRenameLayout}
              onDuplicate={onDuplicateLayout}
              onDelete={onDeleteLayout}
              onShare={onShareLayout}
              onExport={onExportLayout}
            />
          )}
        </Stack.Item>
        <div style={{ flexGrow: 1 }} />
        {layoutDebug && (
          <Stack
            style={{
              position: "sticky",
              bottom: 0,
              left: 0,
              right: 0,
              background: theme.semanticColors.bodyBackground,
              padding: theme.spacing.s1,
              ...debugBorder,
            }}
            tokens={{ childrenGap: theme.spacing.s1 }}
          >
            <Stack.Item grow align="stretch">
              <Stack disableShrink horizontal tokens={{ childrenGap: theme.spacing.s1 }}>
                {layoutDebug.openFakeStorageDirectory && (
                  <Stack.Item grow>
                    <DefaultButton
                      text="Open dir"
                      onClick={() => void layoutDebug.openFakeStorageDirectory?.()}
                      styles={{
                        root: {
                          display: "block",
                          width: "100%",
                          margin: 0,
                        },
                      }}
                    />
                  </Stack.Item>
                )}
                <Stack.Item grow>
                  <DefaultButton
                    text="Sync now"
                    onClick={async () => {
                      await layoutDebug.syncNow();
                      await reloadLayouts();
                    }}
                    styles={{
                      root: {
                        display: "block",
                        width: "100%",
                        margin: 0,
                      },
                    }}
                  />
                </Stack.Item>
              </Stack>
            </Stack.Item>
          </Stack>
        )}
      </Stack>
    </SidebarContent>
  );
}
