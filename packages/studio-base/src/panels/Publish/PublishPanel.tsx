// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { PanelExtensionContext, Topic } from "@foxglove/studio";
import Autocomplete from "@foxglove/studio-base/components/Autocomplete";

type PublishPanelProps = {
  context: PanelExtensionContext;
};

function getTopicName(topic: Topic): string {
  return topic.name;
}

function PublishPanel(props: PublishPanelProps): JSX.Element {
  const { context } = props;

  //const [config] = useState<Config>(props.context.initialState as Config);

  const [topics, setTopics] = useState<readonly Topic[]>([]);

  const [selectedTopic, setSelectedTopic] = useState<Topic | undefined>(undefined);

  const [renderDone, setRenderDone] = useState<() => void>(() => () => {});

  // initial setup on context
  useLayoutEffect(() => {
    context.watch("topics");

    context.onDataSource = () => {
      console.log("new data source");

      // do we need this to get the types we can advertise?
      //context.getAdvertiseTypes();
    };

    context.onRender = (renderState, done) => {
      setRenderDone(() => done);

      if (renderState.topics) {
        setTopics(renderState.topics);
      }
    };
  }, [context]);

  const onSelectTopic = useCallback(
    (_text: string, value: Topic, autocomplete: Autocomplete<Topic>) => {
      setSelectedTopic(value);
      autocomplete.blur();
    },
    [],
  );

  useEffect(() => {
    renderDone();
  }, [renderDone]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div>
        <span>Topic:</span>
        <Autocomplete
          placeholder="Enter a topic"
          items={[...topics]}
          hasError={false}
          onSelect={onSelectTopic}
          selectedItem={selectedTopic}
          getItemText={getTopicName}
          getItemValue={getTopicName}
        />
      </div>
    </div>
  );
}

export default PublishPanel;
