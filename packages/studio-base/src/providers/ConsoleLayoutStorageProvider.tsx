// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PropsWithChildren, useMemo } from "react";

import Log from "@foxglove/log";
import { AppSetting } from "@foxglove/studio-base/AppSetting";
import { useConsoleApi } from "@foxglove/studio-base/context/ConsoleApiContext";
import { useCurrentUser } from "@foxglove/studio-base/context/CurrentUserContext";
import LayoutStorageContext, {
  useLayoutStorage,
} from "@foxglove/studio-base/context/LayoutStorageContext";
import { useAppConfigurationValue } from "@foxglove/studio-base/hooks/useAppConfigurationValue";
import OfflineLayoutStorage from "@foxglove/studio-base/services/OfflineLayoutStorage";

const log = Log.getLogger(__filename);

export default function ConsoleLayoutStorageProvider(
  props: PropsWithChildren<unknown>,
): JSX.Element {
  // any existing layout storage will be our "offline" storage
  const existingLayoutStorage = useLayoutStorage();
  const consoleApi = useConsoleApi();
  const currentUser = useCurrentUser();

  const [enableTeamLayouts = false] = useAppConfigurationValue<boolean>(
    AppSetting.ENABLE_CONSOLE_API_LAYOUTS,
  );

  const offlineLayoutStorage = useMemo(() => {
    //  team layouts require the feature flag and a signed in user
    if (enableTeamLayouts && currentUser) {
      log.info("Using offline-online layout storage");

      // fixme - load the offline layout storage to sync from cloud
      return new OfflineLayoutStorage({
        offlineStorage: existingLayoutStorage,
        consoleApi,
      });
    }

    return existingLayoutStorage;
  }, [consoleApi, currentUser, enableTeamLayouts, existingLayoutStorage]);

  return (
    <LayoutStorageContext.Provider value={offlineLayoutStorage}>
      {props.children}
    </LayoutStorageContext.Provider>
  );
}
