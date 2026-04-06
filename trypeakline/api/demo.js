const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const slug = event.path.replace(/^\/demo\//, "").replace(/\/$/, "");

  if (!slug) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: "<h1>No demo specified</h1>"
    };
  }

  try {
    const store = getStore("demos");
    const html = await store.get(slug);

    if (!html) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: "<h1>Demo not found</h1>"
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h1>Error: ${err.message}</h1>`
    };
  }
};
