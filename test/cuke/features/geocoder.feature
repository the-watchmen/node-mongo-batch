@batch
Feature: geocoder

  Background:
    Given the following documents exist in the 'geocodeMe' collection:
    """
    [
      {
        addressLine1: '333 E 69th Street',
        city: 'New York',
        state: 'NY',
        zip: '10021',
        phone: 'phone-1'
      },
      {
        addressLine1: '151 Farmington Ave',
        city: 'Hartford',
        state: 'CT',
        zip: '06156',
        phone: 'phone-1'
      }
    ]
    """
    And the following documents exist in the '${constants.GEO_ADDRESSES}' collection:
    """
    [
      {
        addressKey: '151 Farmington Ave:Hartford:CT:06156',
        geoPoint: {type: 'Point', coordinates: [1.0, 1.0]}
      }
    ]
    """

    Scenario: geocode
      When we run the '${BATCH}/geocoder' ingester with environment:
      """
      {
        inputCollection: constants.CMS_PROVIDER_SOURCE
      }
      """
      Then mongo query "{}" on '${constants.GEO_ADDRESSES}' should be like:
      """
      [
        {
          addressKey: '151 Farmington Ave:Hartford:CT:06156',
          geoPoint: {type: 'Point', coordinates: [1.0, 1.0]}
        },
        {
          addressKey: '333 E 69th Street:New York:NY:10021',
          geoPoint: {type: 'Point', coordinates: [-73.958125, 40.766299]}
        }
      ]
      """
