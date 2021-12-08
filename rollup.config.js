import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import babel from "@rollup/plugin-babel";
import pkg from "./package.json";

export default [
  {
    input: "lib/index.js",
    output: {
      name: "webrtc",
      file: pkg.browser,
      format: "umd",
    },
    plugins: [
      resolve(),
      commonjs(),
      babel({
        babelHelpers: "bundled",
        exclude: ["node_modules/**"],
      }),
    ],
  },
  {
    input: "lib/index.js",
    output: [
      { file: pkg.main, format: "cjs" },
      { file: pkg.module, format: "es" },
    ],
    plugins: [
      babel({
        babelHelpers: "bundled",
        exclude: ["node_modules/**"],
      }),
    ],
  },
];
