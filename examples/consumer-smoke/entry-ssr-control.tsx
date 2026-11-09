// Consumer smoke: the same host component without the library, used to count the React
// runtime markers one copy leaves in a bundle.
import { useState } from "react";
import { renderToString } from "react-dom/server";

function Probe() {
  const [count] = useState(1);
  return <p>{count}:none</p>;
}

console.log(
  renderToString(<Probe />).includes("1:none") ? "react-ok" : "unexpected",
);
