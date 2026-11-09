// Consumer smoke: the view entry points, imported without React.
import { createGraphModel } from "@paceholder/nodeeditor-js";
import { mountView } from "@paceholder/nodeeditor-js/view";
import { createFrameScheduler } from "@paceholder/nodeeditor-js/view/advanced";

export const mount = mountView;
export const scheduler = createFrameScheduler;
export const model = createGraphModel();
