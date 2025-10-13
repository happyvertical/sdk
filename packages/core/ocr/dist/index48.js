class ImageRawBase {
  data;
  width;
  height;
  constructor({ data, width, height }) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
  getImageRawData() {
    return { data: this.data, width: this.width, height: this.height };
  }
}
export {
  ImageRawBase
};
//# sourceMappingURL=index48.js.map
