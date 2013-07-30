module Volare.Handler.MSM (
    getSurfaceR,
    getBarometricR
) where

import Control.Applicative ((<$>))
import Control.Monad (when)
import Control.Monad.IO.Class (liftIO)
import qualified Data.Aeson as JSON
import Data.Char (toLower)
import Data.Conduit (($$+-))
import qualified Data.Conduit.Binary as CB
import qualified Data.Text as T
import qualified Network.HTTP.Conduit as Http
import System.Directory (createDirectoryIfMissing,
                         doesFileExist)
import System.FilePath (takeDirectory)
import Text.Printf (printf)
import Text.Read (readMaybe)
import Yesod.Core.Handler (lookupGetParam,
                           notFound)

import Volare.Foundation
import qualified Volare.MSM as MSM


getSurfaceR :: Int ->
               Int ->
               Int ->
               Int ->
               Handler JSON.Value
getSurfaceR = getData True MSM.getSurfaceItems


getBarometricR :: Int ->
                  Int ->
                  Int ->
                  Int ->
                  Handler JSON.Value
getBarometricR = getData False MSM.getBarometricItems


getData :: JSON.ToJSON a =>
           Bool ->
           (FilePath -> (Float, Float) -> (Float, Float) -> Int -> IO a) ->
           Int ->
           Int ->
           Int ->
           Int ->
           Handler JSON.Value
getData surface f year month day hour = do
  nwLatitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "nwlat"
  nwLongitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "nwlon"
  seLatitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "selat"
  seLongitude <- (>>= readMaybe . T.unpack) <$> lookupGetParam "selon"
  case (nwLatitude, nwLongitude, seLatitude, seLongitude) of
    (Just nwLat, Just nwLon, Just seLat, Just seLon) -> do
      path <- liftIO $ dataFile surface year month day
      surfaces <- liftIO $ f path (nwLat, nwLon) (seLat, seLon) hour
      return $ JSON.toJSON surfaces
    _ -> notFound


dataFile :: Bool ->
            Int ->
            Int ->
            Int ->
            IO FilePath
dataFile surface year month day = do
  let t = if surface then 'S' else 'P'
      path = printf "./data/msm/%c/%04d%02d%02d.nc" (toLower t) year month day
      url = printf "http://database.rish.kyoto-u.ac.jp/arch/jmadata/data/gpv/netcdf/MSM-%c/%04d/%02d%02d.nc" t year month day
  b <- doesFileExist path
  when (not b) $ do
    createDirectoryIfMissing True $ takeDirectory path
    req <- Http.parseUrl url
    Http.withManager $ \manager -> do
      res <- Http.http req manager
      Http.responseBody res $$+- CB.sinkFile path
  return path