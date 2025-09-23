module.exports = (context, options) => ({
  name: 'esm-resolver',
  configureWebpack(config, isServer) {
    return {
      resolve: {
        fullySpecified: false,
      },
      module: {
        rules: [
          {
            test: /\.m?js$/,
            resolve: {
              fullySpecified: false,
            },
          },
        ],
      },
    };
  },
});
