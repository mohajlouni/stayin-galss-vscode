module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo is declared directly in devDependencies so Metro and Expo Go
    // resolve the same preset after cache cleanup or a clean install.
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    // The worklets transform must remain last for Expo SDK 54/Reanimated compatibility.
    plugins: ["react-native-worklets/plugin"],
  };
};
