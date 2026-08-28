#import "AppIconManager.h"

#import <UIKit/UIKit.h>

@implementation AppIconManager

RCT_EXPORT_MODULE(AppIconManager);

RCT_EXPORT_METHOD(setIcon:(NSString *)iconId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *alternateIconName = nil;
  if ([iconId isEqualToString:@"standard"]) {
    // nil is the explicit iOS reset to the primary AppIcon asset.
    alternateIconName = nil;
  } else if ([iconId isEqualToString:@"app_icon_midnight"]) {
    alternateIconName = @"midnight";
  } else if ([iconId isEqualToString:@"app_icon_neon"]) {
    alternateIconName = @"neon";
  } else if ([iconId isEqualToString:@"app_icon_scholar"]) {
    alternateIconName = @"scholar";
  } else if ([iconId isEqualToString:@"app_icon_aurora"]) {
    alternateIconName = @"aurora";
  } else if ([iconId isEqualToString:@"app_icon_legend"]) {
    alternateIconName = @"legend";
  } else {
    reject(@"E_INVALID_ICON", [NSString stringWithFormat:@"Unsupported launcher icon: %@", iconId], nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIApplication *application = UIApplication.sharedApplication;
    if (!application.supportsAlternateIcons) {
      reject(@"E_ALTERNATE_ICONS_UNAVAILABLE", @"Alternate app icons are not available.", nil);
      return;
    }

    [application setAlternateIconName:alternateIconName
                    completionHandler:^(NSError * _Nullable error) {
      if (error) {
        reject(@"E_ICON_UPDATE", error.localizedDescription, error);
      } else {
        resolve(nil);
      }
    }];
  });
}

@end