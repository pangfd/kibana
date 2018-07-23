/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { Fragment } from 'react';
import { isEqual } from 'lodash';
import { VisRequestHandlersRegistryProvider } from '../../registry/vis_request_handlers';
import { VisResponseHandlersRegistryProvider } from '../../registry/vis_response_handlers';

import {
  isTermSizeZeroError,
} from '../../elasticsearch_errors';

import { toastNotifications } from 'ui/notify';
import { SearchError } from 'ui/courier';

function getHandler(from, name) {
  if (typeof name === 'function') return name;
  return from.find(handler => handler.name === name).handler;
}

export class VisualizeDataLoader {
  constructor(vis, Private) {
    this._vis = vis;

    const { requestHandler, responseHandler } = this._vis.type;

    const requestHandlers = Private(VisRequestHandlersRegistryProvider);
    const responseHandlers = Private(VisResponseHandlersRegistryProvider);
    this._requestHandler = getHandler(requestHandlers, requestHandler);
    this._responseHandler = getHandler(responseHandlers, responseHandler);
  }

  fetch = async (props, forceFetch = false) => {

    this._vis.filters = { timeRange: props.timeRange };

    const handlerParams = { ...props, forceFetch };

    try {
      // searchSource is only there for courier request handler
      const requestHandlerResponse = await this._requestHandler(this._vis, handlerParams);

      //No need to call the response handler when there have been no data nor has been there changes
      //in the vis-state (response handler does not depend on uiStat
      const canSkipResponseHandler = (
        this._previousRequestHandlerResponse && this._previousRequestHandlerResponse === requestHandlerResponse &&
        this._previousVisState && isEqual(this._previousVisState, this._vis.getState())
      );

      this._previousVisState = this._vis.getState();
      this._previousRequestHandlerResponse = requestHandlerResponse;
      this._vis.requestError = undefined;

      if (!canSkipResponseHandler) {
        this._visData = await Promise.resolve(this._responseHandler(this._vis, requestHandlerResponse));
      }
      return this._visData;
    }
    catch (error) {
      props.searchSource.cancelQueued();
      this._vis.requestError = error;

      if (isTermSizeZeroError(error)) {
        return toastNotifications.addDanger({
          title: `Visualization ('${this._vis.title}') has term aggregation of size 0`,
          text: `Set it to a size greater than 0`,
        });
      }

      if (error instanceof SearchError) {
        const { message, path, status } = error;
        return toastNotifications.addDanger({
          title: `Visualization '${this._vis.title}' search failed`,
          text: (
            <Fragment>
              <p>{message}</p>
              <p><code>{status} {path}</code></p>
            </Fragment>
          ),
        });
      }

      toastNotifications.addDanger({
        title: `Visualization '${this._vis.title}' has an error`,
        text: error,
      });
    }
  }
}
