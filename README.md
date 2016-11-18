# Run web-app

## build

>  npm install

## run with nodemon

> DEBUG=* nodemon server/server.js

# LoopBack Connector for Google Cloud

## Installation

    npm install loopback-connector-gcloud

Or see here: https://www.npmjs.com/package/loopback-connector-gcloud

## Database Configuration

In order for the connector to load property, you have to add the gcloud definition into the database configuration json file, usually found in ``/server/database.json``.

In a production Google Compute Engine environment, **projectId** is the only required property.

```json
"gcloud-datastore": {
    "name": "gcloud-datastore",
    "connector": "gcloud",
    "projectId": "<project-id-here>"
}
```

If you are running locally, and calling out to the Cloud DataStore over a network, then the **keyFilename** and **email** properties are also required. Email is the service email as provided by Google. See #here# in for information on how to configure a service client in the Google Developer Console.

```json
"gcloud-datastore": {
    "name": "gcloud-datastore",
    "connector": "gcloud",
    "projectId": "<project-id-here>",
    "keyFilename": "/path/to/your/secret-key.pem",
    "email": "<lots-of-numbers-from-your-service-email>@developer.gserviceaccount.com"
}
```

## Model Configuration

In ``server/model-config.json``, set something similar to this:

```json
    ...
    "MyModel": {
        "dataSource": "gcloud-datastore",
        "public": true
    },
    ...
```

In ``common/models/<modelname>.json``, set something similar to this:

```json
{
    "name": "MyModel",
    "plural": "MyModels",
    "base": "PersistedModel",
    "idInjection": true,
    "strict": true,
    "properties": {
        "Label": {
            "type": "string",
            "required": true
        },
        "PluralLabel": {
            "type": "string",
            "required": true
        },
        "Id": {
            "type": "number",
            "id": true,
            "doc": "MyModel ID"
        }
    },
    ...
}
```

Google Cloud DataStore treats the internal IDs in a special way as a (Model, ID) tuple. As a result, there is a bit of code to quietly insert/extract the IDs into the response JSON data.. something like this:

```json
[
  {
    "Label": "Foo",
    "PluralLabel": "OtherFoo",
    "Id": 5629499534213120
  },
  {
    "Label": "Something",
    "Id": 5639445604728832
  },
  {
    "Label": "Something Else",
    "Id": 5649391675244544
  }
]
```

## Things that work

all(), find(), findById(), create(), updateProperties(), destroyAll()

Logging is mostly in place. Do an ```export DEBUG=*:gcloud-datastore``` before running the server to see all the network stuff.

## Things that work funny

When doing something like ``PUT /mymodel/5649391675244544``, the Loopback framework first does an ``all()`` with a restricted-by-id where clause, which (internally) proxies to ``find()``. That makes sense, because we would like to fetch all the current properties as the first half of an update process.

Sadly, the Loopback framework then discards all that effort, and subsequently calls ``updateProperties()`` (what we originally wanted it to do) but doesn't pass in the fetched data. Instead it passes in the **original** data from the REST call (which usually doesn't contain all or most of what we want to write back).. THis is a problem because Google Cloud DataStore won't internally merge properties. It will just blindly overwrite all of the old stuff with your new stuff.

As a result, the ``updateProperties()`` method has to burn another ``find()`` call, just to refetch the complete data set, merge properties, and then commit the final save. Annoying, and I don't currently have a workaround.
