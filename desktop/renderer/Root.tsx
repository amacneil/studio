// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { ReactElement, useCallback, useMemo } from "react";

import {
  App,
  ErrorBoundary,
  MultiProvider,
  PlayerSourceDefinition,
  ThemeProvider,
  UserProfileLocalStorageProvider,
  StudioToastProvider,
} from "@foxglove/studio-base";

import { Desktop } from "../common/types";
import NativeAppMenuProvider from "./components/NativeAppMenuProvider";
import NativeStorageAppConfigurationProvider from "./components/NativeStorageAppConfigurationProvider";
import ExtensionLoaderProvider from "./providers/ExtensionLoaderProvider";
import NativeStorageLayoutStorageProvider from "./providers/NativeStorageLayoutStorageProvider";

const DEMO_BAG_URL = "https://storage.googleapis.com/foxglove-public-assets/demo.bag";

const desktopBridge = (global as unknown as { desktopBridge: Desktop }).desktopBridge;

export default function Root(): ReactElement {
  const playerSources: PlayerSourceDefinition[] = [
    {
      name: "ROS 1",
      type: "ros1-socket",
    },
    {
      name: "ROS 1 Rosbridge (WebSocket)",
      type: "ros1-rosbridge-websocket",
    },
    {
      name: "ROS 2 Rosbridge (WebSocket)",
      type: "ros2-rosbridge-websocket",
    },
    {
      name: "ROS 1 Bag (local)",
      type: "ros1-local-bagfile",
    },
    {
      name: "ROS 1 Bag (HTTP)",
      type: "ros1-remote-bagfile",
    },
    {
      name: "ROS 2 Bag (local)",
      type: "ros2-local-bagfile",
    },
    {
      name: "Velodyne LIDAR",
      type: "velodyne-device",
    },
  ];

  const providers = [
    /* eslint-disable react/jsx-key */
    <StudioToastProvider />,
    <NativeStorageAppConfigurationProvider />,
    <NativeStorageLayoutStorageProvider />,
    <NativeAppMenuProvider />,
    <UserProfileLocalStorageProvider />,
    <ExtensionLoaderProvider />,
    /* eslint-enable react/jsx-key */
  ];

  const deepLinks = useMemo(() => desktopBridge.getDeepLinks(), []);

  const handleToolbarDoubleClick = useCallback(() => desktopBridge.handleToolbarDoubleClick(), []);

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <MultiProvider providers={providers}>
          <App
            demoBagUrl={DEMO_BAG_URL}
            deepLinks={deepLinks}
            onFullscreenToggle={handleToolbarDoubleClick}
            availableSources={playerSources}
          />
        </MultiProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
