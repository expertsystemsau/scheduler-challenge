import { Scheduler, WidgetHelper, Toast, AbstractCrudManager, AjaxTransport, CrudManager, JsonEncoder, Config, Objects } from '../../build/schedulerpro.module.js';
import shared from '../_shared/shared.module.js';

const cookie = 'PHPSESSID=schedulerpro-crudmanager';
if (!(document.cookie.includes(cookie))) {
    document.cookie = `${cookie}-${Math.random().toString(16).substring(2)}`;
}


class MyCrudManager extends CrudManager {
    /**
     * Sends a __Crud Manager__ request to the server.
     * @param {Object}   request The request configuration object having following properties:
     * @param {String}   request.type The request type. Either `load` or `sync`.
     * @param {String}   request.data The encoded __Crud Manager__ request data.
     * @param {Object}   request.params An object specifying extra HTTP params to send with the request.
     * @param {Function} request.success A function to be started on successful request transferring.
     * @param {String}   request.success.rawResponse `Response` object returned by the [fetch api](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).
     * @param {Function} request.failure A function to be started on request transfer failure.
     * @param {String}   request.failure.rawResponse `Response` object returned by the [fetch api](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).
     * @param {Object}   request.thisObj `this` reference for the above `success` and `failure` functions.
     * @return {Promise} The fetch Promise object.
     * @fires beforesend
     */

    sendRequest(request) {
        const me = this,
            {data} = request,
            transportConfig = me.transport[request.type] || {},
            
            // clone parameters defined for this type of request
        requestConfig = Objects.assign({}, transportConfig, transportConfig.requestConfig);
        // requestConfig.method = requestConfig.method || AjaxTransport.defaultMethod[request.type];
        requestConfig.params = Objects.assign(requestConfig.params || {}, request.params);
        let {paramName} = requestConfig; // transfer package in the request body for some types of HTTP requests

        if (me.shouldUseBodyForRequestData(transportConfig, requestConfig.method, paramName)) {
            requestConfig.body = data; // for requests having body we set Content-Type to 'application/json' by default

            requestConfig.headers = requestConfig.headers || {};
            requestConfig.headers['Content-Type'] = requestConfig.headers['Content-Type'] || 'application/json';
        } else {
            paramName = paramName || 'data';
            requestConfig.params[paramName] = JSON.parse(data);
        }

        if (!requestConfig.url) {
            throw new Error('Trying to request without URL specified');
        } 

        delete requestConfig.requestConfig;
        delete requestConfig.paramName;

        me.trigger('beforeSend', {
            params: requestConfig.params,
            type: request.type,
            requestConfig,
            config: request
        }); 


        let responsePromise;
        const fetchOptions = Objects.assign({}, requestConfig, requestConfig.fetchOptions);    

        const ajaxPromise = axios.get(fetchOptions.url, {
            transformResponse: [],
            params: fetchOptions.params[paramName]
        });

        ajaxPromise.catch(error => {
            const signal = fetchOptions.abortController && fetchOptions.abortController.signal;

            if (signal && !signal.aborted) {
                console.warn(error);
            }
        }).then(response => {
            let fetchResponseObj = new Response(response.data, {
                "status" : response.status,
                "statusText" : response.statusText,
            });

            if (response && response.statusText === "OK") {
                responsePromise = request.success.call(request.thisObj || me, fetchResponseObj, fetchOptions);
            } else {
                responsePromise = request.failure.call(request.thisObj || me, fetchResponseObj, fetchOptions);
            }
        });
        return Promise.all([ajaxPromise, responsePromise]);
    }

}



const customCrudManager = new MyCrudManager(
    {
        resourceStore: {
            // Add some custom fields
            fields: ['car', 'dt']
        },

        eventStore: {
            // Add a custom field and redefine durationUnit to default to hours
            fields: ['dt', { name: 'durationUnit', defaultValue: 'hour' }]
        },

        transport: {
            load: {
                url: 'php/read.php',
                paramName: 'data',
            },
            sync: {
                url: 'php/sync.php'
            }
        },

        autoLoad: true,
        autoSync: true,
        onRequestFail: (event) => {
            const
                { requestType, response } = event,
                serverMessage = response && response.message,
                exceptionText = `Action "${requestType}" failed. ${serverMessage ? ` Server response: ${serverMessage}` : ''}`;

            Toast.show({
                html: exceptionText,
                color: 'b-red',
                style: 'color:white',
                timeout: 3000
            });

            console.error(exceptionText);
        }
    }
);

const scheduler = new Scheduler({
    appendTo: 'container',
    minHeight: '20em',
    startDate: new Date(2018, 4, 21, 6),
    endDate: new Date(2018, 4, 21, 18),
    viewPreset: 'hourAndDay',
    rowHeight: 50,
    barMargin: 5,
    eventColor: 'orange',
    eventStyle: 'colored',

    features: {
        // Configure event editor to display 'brand' as resource name
        eventEdit: {
            resourceFieldConfig: {
                displayField: 'car'
            }
        }
    },

    columns: [
        { text: 'Id', field: 'id', width: 100, editor: false, hidden: true },
        { text: 'Car', field: 'car', width: 150 },
        {
            type: 'date',
            text: 'Modified',
            field: 'dt',
            width: 90,
            format: 'HH:mm:ss',
            editor: false,
            hidden: true
        }
    ],

    crudManager: customCrudManager,

    tbar: [
        {
            type: 'button',
            ref: 'reloadButton',
            icon: 'b-fa b-fa-sync',
            text: 'Reload scheduler',
            onAction() {
                scheduler.crudManager.load()
                    .then(() => WidgetHelper.toast('Data reloaded'))
                    .catch(() => WidgetHelper.toast('Loading failed'));
            }
        },
        {
            type: 'button',
            ref: 'resetButton',
            color: 'b-red',
            icon: 'b-fa b-fa-recycle',
            text: 'Reset database',
            onAction() {
                scheduler.crudManager.load({
                    // Adding a query string parameter "...&reset=1" to let server know that we want to reset the database
                    request: {
                        params: {
                            reset: 1
                        }
                    }
                })
                    .then(() => WidgetHelper.toast('Database was reset'))
                    .catch(() => WidgetHelper.toast('Database reset failed'));
            }
        }
    ]
});
